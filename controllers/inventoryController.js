const db = require('../config/database');

// Fields a manager is allowed to set on an inventory item
const EDITABLE_FIELDS = ['name', 'category_id', 'quantity', 'unit', 'min_quantity', 'unit_cost', 'supplier_id'];
const NUMBER_FIELDS = ['quantity', 'min_quantity', 'unit_cost'];

// Base query: item + category name + supplier name + low-stock flag
const SELECT_ITEMS = `
  SELECT i.*,
         c.name AS category_name,
         s.name AS supplier_name,
         (i.quantity IS NOT NULL AND i.min_quantity IS NOT NULL AND i.quantity <= i.min_quantity) AS is_low_stock
  FROM inventory_items i
  LEFT JOIN categories c ON i.category_id = c.id
  LEFT JOIN suppliers  s ON i.supplier_id = s.id
`;

// Returns an error message if any number field is invalid, otherwise null
const validateNumbers = (body) => {
  for (const field of NUMBER_FIELDS) {
    if (body[field] === undefined || body[field] === null) continue;
    const n = Number(body[field]);
    if (Number.isNaN(n) || n < 0) return `${field} must be a number >= 0`;
  }
  return null;
};

// Turns PostgreSQL errors into friendly HTTP responses
const handleDbError = (res, error, context) => {
  if (error.code === '22P02') {
    // Invalid input syntax, e.g. /api/inventory/abc
    return res.status(400).json({ error: 'Invalid id or value format' });
  }
  if (error.code === '23503') {
    // Foreign key violation
    return res.status(400).json({ error: 'Invalid category_id or supplier_id (or item is used in orders)' });
  }
  console.error(`${context} error:`, error);
  return res.status(500).json({ error: 'Server error' });
};

// GET /api/inventory?lowStock=true&categoryId=2&search=tom
const getItems = async (req, res) => {
  try {
    const { lowStock, categoryId, search } = req.query;
    const conditions = [];
    const values = [];

    if (lowStock === 'true') {
      conditions.push('i.quantity <= i.min_quantity');
    }
    if (categoryId) {
      values.push(categoryId);
      conditions.push(`i.category_id = $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      conditions.push(`i.name ILIKE $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(`${SELECT_ITEMS} ${where} ORDER BY i.name`, values);
    res.json({ count: result.rows.length, items: result.rows });
  } catch (error) {
    handleDbError(res, error, 'GetItems');
  }
};

// GET /api/inventory/:id
const getItemById = async (req, res) => {
  try {
    const result = await db.query(`${SELECT_ITEMS} WHERE i.id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ item: result.rows[0] });
  } catch (error) {
    handleDbError(res, error, 'GetItemById');
  }
};

// POST /api/inventory  (manager only)
const createItem = async (req, res) => {
  try {
    const { name, category_id, quantity, unit, min_quantity, unit_cost, supplier_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const numberError = validateNumbers(req.body);
    if (numberError) return res.status(400).json({ error: numberError });

    const result = await db.query(
      `INSERT INTO inventory_items (name, category_id, quantity, unit, min_quantity, unit_cost, supplier_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name.trim(), category_id ?? null, quantity ?? 0, unit ?? null, min_quantity ?? 0, unit_cost ?? null, supplier_id ?? null]
    );
    res.status(201).json({ message: 'Item created', item: result.rows[0] });
  } catch (error) {
    handleDbError(res, error, 'CreateItem');
  }
};

// PUT /api/inventory/:id  (manager only) - updates only the fields sent
const updateItem = async (req, res) => {
  try {
    const fields = EDITABLE_FIELDS.filter((f) => req.body[f] !== undefined);
    if (fields.length === 0) {
      return res.status(400).json({ error: `Send at least one of: ${EDITABLE_FIELDS.join(', ')}` });
    }
    if (req.body.name !== undefined && !String(req.body.name).trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    const numberError = validateNumbers(req.body);
    if (numberError) return res.status(400).json({ error: numberError });

    // Builds: "name = $1, quantity = $2, updated_at = NOW()"
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = fields.map((f) => req.body[f]);
    values.push(req.params.id);

    const result = await db.query(
      `UPDATE inventory_items SET ${setClause}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Item updated', item: result.rows[0] });
  } catch (error) {
    handleDbError(res, error, 'UpdateItem');
  }
};

// PATCH /api/inventory/:id/quantity  (any logged-in user) - stock count
const updateQuantity = async (req, res) => {
  try {
    const { quantity } = req.body;
    const n = Number(quantity);
    if (quantity === undefined || quantity === null || quantity === '' || Number.isNaN(n) || n < 0) {
      return res.status(400).json({ error: 'quantity must be a number >= 0' });
    }

    const result = await db.query(
      `UPDATE inventory_items SET quantity = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [n, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Quantity updated', item: result.rows[0] });
  } catch (error) {
    handleDbError(res, error, 'UpdateQuantity');
  }
};

// DELETE /api/inventory/:id  (manager only)
const deleteItem = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM inventory_items WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Item deleted', item: result.rows[0] });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'Item is used in existing orders and cannot be deleted' });
    }
    handleDbError(res, error, 'DeleteItem');
  }
};

module.exports = { getItems, getItemById, createItem, updateItem, updateQuantity, deleteItem };
