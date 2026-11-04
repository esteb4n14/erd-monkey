const assert = require('node:assert/strict');
const fs = require('node:fs');
global.window = global;
require('../sql-parser.js');

const sample = SqlParser.parse(fs.readFileSync('sample.sql', 'utf8'));
assert.equal(sample.tables.size, 7);
assert.equal(sample.links.length, 7);
assert.deepEqual(sample.diagnostics, []);

const sql = 'CREATE TABLE p (id int, x int, UNIQUE (id, x)); ALTER TABLE p ADD PRIMARY KEY (id); CREATE TABLE c (a int UNIQUE, b int, label varchar(20) NOT NULL, FOREIGN KEY (a,b) REFERENCES p(id,x));';
const parsed = SqlParser.parse(sql);
assert.equal(parsed.tables.get('[null,"p"]').columns[0].isPk, true);
assert.equal(parsed.links.length, 2);
assert.ok(parsed.links.every(link => link.cardinality === '1:1'));
const edited = SqlParser.editColumn(sql, '[null,"c"]', 'label', 'etiqueta', 'text');
assert.match(edited, /"etiqueta" text NOT NULL/);
assert.equal(SqlParser.parse(edited).tables.get('[null,"c"]').columns[2].name, 'etiqueta');
assert.throws(() => SqlParser.editColumn(sql, '[null,"c"]', 'a', 'other', 'int'), /otras partes/);
assert.throws(() => SqlParser.editColumn(sql, '[null,"c"]', 'label', 'a', 'text'), /duplicada/);
assert.throws(() => SqlParser.editColumn(sql, '[null,"c"]', 'label', 'label', 'text; DROP TABLE p'), /tipo SQL/);
console.log('Pruebas del parser: correctas.');
