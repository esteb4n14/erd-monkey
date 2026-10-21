/*
 * Parser pequeño para DDL PostgreSQL.
 * Mantiene el análisis separado del DOM y conserva los identificadores
 * entrecomillados tal como PostgreSQL los interpreta.
 */
(function (root) {
  'use strict';

  const TABLE_COLORS = ['#1e3a8a', '#065f46', '#7c2d12', '#581c87', '#831843', '#0e7490', '#334155', '#4338ca'];
  const CONSTRAINT_WORDS = new Set(['NOT', 'NULL', 'DEFAULT', 'PRIMARY', 'UNIQUE', 'REFERENCES', 'CHECK', 'CONSTRAINT', 'COLLATE', 'GENERATED']);

  function tokenize(sql) {
    const tokens = [];
    let i = 0;
    while (i < sql.length) {
      const ch = sql[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '-' && sql[i + 1] === '-') {
        i += 2;
        while (i < sql.length && sql[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && sql[i + 1] === '*') {
        i += 2;
        let depth = 1;
        while (i < sql.length && depth) {
          if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
          else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
          else i++;
        }
        continue;
      }
      if (ch === '$') {
        const delimiter = sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
        if (delimiter) {
          const end = sql.indexOf(delimiter[0], i + delimiter[0].length);
          i = end < 0 ? sql.length : end + delimiter[0].length;
          tokens.push({ type: 'string', value: '' });
          continue;
        }
      }
      if (ch === "'") {
        const isEscapeString = (sql[i - 1] === 'e' || sql[i - 1] === 'E') &&
          (i < 2 || !/[A-Za-z0-9_$]/.test(sql[i - 2]));
        i++;
        let value = '';
        while (i < sql.length) {
          if (sql[i] === "'" && sql[i + 1] === "'") { value += "'"; i += 2; }
          else if (sql[i] === "'") { i++; break; }
          else if (isEscapeString && sql[i] === '\\' && i + 1 < sql.length) { value += sql[i + 1]; i += 2; }
          else value += sql[i++];
        }
        tokens.push({ type: 'string', value });
        continue;
      }
      if (ch === '"') {
        i++;
        let value = '';
        while (i < sql.length) {
          if (sql[i] === '"' && sql[i + 1] === '"') { value += '"'; i += 2; }
          else if (sql[i] === '"') { i++; break; }
          else value += sql[i++];
        }
        tokens.push({ type: 'identifier', value, quoted: true });
        continue;
      }
      const word = sql.slice(i).match(/^[A-Za-z_][A-Za-z_0-9$]*/);
      if (word) {
        tokens.push({ type: 'identifier', value: word[0].toLowerCase(), quoted: false });
        i += word[0].length;
        continue;
      }
      const number = sql.slice(i).match(/^\d+(?:\.\d+)?/);
      if (number) { tokens.push({ type: 'number', value: number[0] }); i += number[0].length; continue; }
      tokens.push({ type: 'symbol', value: ch });
      i++;
    }
    return tokens;
  }

  function isWord(token, value) {
    return !!token && token.type === 'identifier' && !token.quoted && token.value.toUpperCase() === value;
  }

  function readIdentifier(tokens, index) {
    const token = tokens[index];
    if (!token || token.type !== 'identifier') return null;
    return { value: token.value, next: index + 1 };
  }

  function readQualifiedName(tokens, index) {
    const first = readIdentifier(tokens, index);
    if (!first) return null;
    if (tokens[first.next] && tokens[first.next].value === '.') {
      const second = readIdentifier(tokens, first.next + 1);
      if (!second) return null;
      return { schema: first.value, name: second.value, key: JSON.stringify([first.value, second.value]), display: `${first.value}.${second.value}`, next: second.next };
    }
    return { schema: null, name: first.value, key: JSON.stringify([null, first.value]), display: first.value, next: first.next };
  }

  function readIdentifierList(tokens, index) {
    if (!tokens[index] || tokens[index].value !== '(') return null;
    const values = [];
    let i = index + 1;
    while (i < tokens.length) {
      const id = readIdentifier(tokens, i);
      if (!id) return null;
      values.push(id.value);
      i = id.next;
      if (tokens[i] && tokens[i].value === ')') return { values, next: i + 1 };
      if (!tokens[i] || tokens[i].value !== ',') return null;
      i++;
    }
    return null;
  }

  function splitTopLevel(tokens) {
    const parts = [];
    let start = 0;
    let depth = 0;
    let bracketDepth = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].value === '(') depth++;
      else if (tokens[i].value === ')') depth--;
      else if (tokens[i].value === '[') bracketDepth++;
      else if (tokens[i].value === ']') bracketDepth--;
      else if (tokens[i].value === ',' && depth === 0 && bracketDepth === 0) { parts.push(tokens.slice(start, i)); start = i + 1; }
    }
    if (start < tokens.length) parts.push(tokens.slice(start));
    return parts;
  }

  function matchingParen(tokens, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < tokens.length; i++) {
      if (tokens[i].value === '(') depth++;
      else if (tokens[i].value === ')' && --depth === 0) return i;
    }
    return -1;
  }

  function readReference(tokens, index) {
    if (!isWord(tokens[index], 'REFERENCES')) return null;
    const table = readQualifiedName(tokens, index + 1);
    if (!table) return null;
    const columns = tokens[table.next] && tokens[table.next].value === '(' ? readIdentifierList(tokens, table.next) : null;
    return { table: { schema: table.schema, name: table.name }, columns: columns ? columns.values : null, next: columns ? columns.next : table.next };
  }

  function parseConstraint(definition, table) {
    let i = 0;
    const hasConstraintName = isWord(definition[i], 'CONSTRAINT');
    if (hasConstraintName) i += 2;
    if (isWord(definition[i], 'PRIMARY') && isWord(definition[i + 1], 'KEY')) {
      const cols = readIdentifierList(definition, i + 2);
      if (!cols) return false;
      table.primaryKey = cols.values;
      table.uniqueConstraints.push(cols.values);
      return true;
    }
    if (isWord(definition[i], 'UNIQUE')) {
      let columnsIndex = i + 1;
      if (isWord(definition[columnsIndex], 'NULLS') && isWord(definition[columnsIndex + 1], 'NOT') && isWord(definition[columnsIndex + 2], 'DISTINCT')) columnsIndex += 3;
      const cols = readIdentifierList(definition, columnsIndex);
      if (!cols) return false;
      table.uniqueConstraints.push(cols.values);
      return true;
    }
    if (isWord(definition[i], 'FOREIGN') && isWord(definition[i + 1], 'KEY')) {
      const from = readIdentifierList(definition, i + 2);
      if (!from || !isWord(definition[from.next], 'REFERENCES')) return false;
      const ref = readReference(definition, from.next);
      if (!ref) return false;
      table.foreignKeys.push({ columns: from.values, targetTable: ref.table, targetColumns: ref.columns });
      return true;
    }
    if (isWord(definition[i], 'CHECK')) return true;
    if (hasConstraintName) return false;

    const column = readIdentifier(definition, 0);
    if (!column) return false;
    const rest = definition.slice(column.next);
    let typeEnd = rest.findIndex(token => token.type === 'identifier' && !token.quoted && CONSTRAINT_WORDS.has(token.value.toUpperCase()));
    if (typeEnd < 0) typeEnd = rest.length;
    const typeTokens = rest.slice(0, typeEnd);
    const type = formatTokens(typeTokens).trim() || 'UNKNOWN';
    const col = { name: column.value, type, isPk: false, isFk: false };
    table.columns.push(col);

    for (let j = typeEnd; j < rest.length; j++) {
      if (isWord(rest[j], 'PRIMARY') && isWord(rest[j + 1], 'KEY')) {
        table.primaryKey.push(col.name);
        table.uniqueConstraints.push([col.name]);
      } else if (isWord(rest[j], 'UNIQUE')) {
        table.uniqueConstraints.push([col.name]);
      } else if (isWord(rest[j], 'REFERENCES')) {
        const ref = readReference(rest, j);
        if (ref) table.foreignKeys.push({ columns: [col.name], targetTable: ref.table, targetColumns: ref.columns });
      }
    }
    return true;
  }

  function formatTokens(tokens) {
    let result = '';
    tokens.forEach((token, index) => {
      const prev = tokens[index - 1];
      if (index > 0 && token.value !== ')' && token.value !== ']' && token.value !== ',' && token.value !== '.' && (!prev || !['(', '[', '.'].includes(prev.value))) result += ' ';
      result += token.type === 'identifier' && token.quoted ? `"${token.value}"` : token.value;
    });
    return result;
  }

  function parseCreate(tokens, start, tables, diagnostics) {
    let i = start + 1;
    while (['GLOBAL', 'LOCAL', 'TEMP', 'TEMPORARY', 'UNLOGGED'].some(keyword => isWord(tokens[i], keyword))) i++;
    i++;
    if (isWord(tokens[i], 'IF') && isWord(tokens[i + 1], 'NOT') && isWord(tokens[i + 2], 'EXISTS')) i += 3;
    const name = readQualifiedName(tokens, i);
    if (!name) {
      diagnostics.push('No se pudo interpretar el nombre de una tabla en CREATE TABLE.');
      return start + 1;
    }
    i = name.next;
    while (tokens[i] && tokens[i].value !== '(' && tokens[i].value !== ';') i++;
    if (!tokens[i] || tokens[i].value !== '(') {
      diagnostics.push(`No se pudo interpretar la definición de ${name.display}: falta la lista de columnas.`);
      return i + 1;
    }
    const close = matchingParen(tokens, i);
    if (close < 0) { diagnostics.push(`La definición de ${name.display} quedó sin cerrar.`); return tokens.length; }
    const table = {
      id: name.key,
      key: name.key,
      name: name.display,
      schema: name.schema,
      columns: [],
      x: 60 + (tables.size % 3) * 320,
      y: 60 + Math.floor(tables.size / 3) * 360,
      color: TABLE_COLORS[tables.size % TABLE_COLORS.length],
      primaryKey: [],
      uniqueConstraints: [],
      foreignKeys: []
    };
    splitTopLevel(tokens.slice(i + 1, close)).forEach(definition => {
      if (!parseConstraint(definition, table)) diagnostics.push(`No se pudo interpretar una definición de ${table.name}: ${formatTokens(definition)}`);
    });
    if (tables.has(table.key)) diagnostics.push(`La tabla ${table.name} aparece más de una vez; se conserva su última definición.`);
    tables.set(table.key, table);
    return close + 1;
  }

  function parseAlter(tokens, start, tables, diagnostics) {
    let i = start + 2;
    if (isWord(tokens[i], 'ONLY')) i++;
    const name = readQualifiedName(tokens, i);
    if (!name) return start + 1;
    const candidates = name.schema ? [] : Array.from(tables.values()).filter(item => item.name === name.name);
    const table = tables.get(name.key) || (candidates.length === 1 ? candidates[0] : null);
    if (!table && candidates.length > 1) diagnostics.push(`ALTER TABLE ${name.name} es ambiguo porque existe en varios esquemas.`);
    i = name.next;
    while (i < tokens.length && tokens[i].value !== ';') {
      if (isWord(tokens[i], 'ADD')) {
        i++;
        if (isWord(tokens[i], 'CONSTRAINT')) i += 2;
        if (isWord(tokens[i], 'FOREIGN') && isWord(tokens[i + 1], 'KEY')) {
          const from = readIdentifierList(tokens, i + 2);
          if (from && isWord(tokens[from.next], 'REFERENCES')) {
            const ref = readReference(tokens, from.next);
            if (ref && table) table.foreignKeys.push({ columns: from.values, targetTable: ref.table, targetColumns: ref.columns });
            else if (ref) diagnostics.push(`No se encontró la tabla ${name.display} para agregar la clave foránea.`);
            i = ref ? ref.next : from.next + 1;
            continue;
          }
        }
      }
      i++;
    }
    return i + 1;
  }

  function sameColumnSet(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    const left = [...a].sort();
    const right = [...b].sort();
    return left.every((value, index) => value === right[index]);
  }

  function parse(sqlText) {
    const tokens = tokenize(String(sqlText || ''));
    const tables = new Map();
    const diagnostics = [];
    for (let i = 0; i < tokens.length;) {
      if (!isWord(tokens[i], 'CREATE')) { i++; continue; }
      let tableToken = i + 1;
      while (['GLOBAL', 'LOCAL', 'TEMP', 'TEMPORARY', 'UNLOGGED'].some(keyword => isWord(tokens[tableToken], keyword))) tableToken++;
      if (isWord(tokens[tableToken], 'TABLE')) i = parseCreate(tokens, i, tables, diagnostics);
      else i++;
    }
    for (let i = 0; i < tokens.length;) {
      if (isWord(tokens[i], 'ALTER') && isWord(tokens[i + 1], 'TABLE')) i = parseAlter(tokens, i, tables, diagnostics);
      else i++;
    }

    const links = [];
    let linkId = 1;
    tables.forEach(table => {
      table.primaryKey.forEach(key => { const column = table.columns.find(item => item.name === key); if (column) column.isPk = true; });
      table.foreignKeys.forEach(fk => {
        const targetKey = fk.targetTable.schema
          ? JSON.stringify([fk.targetTable.schema, fk.targetTable.name])
          : (table.schema && tables.has(JSON.stringify([table.schema, fk.targetTable.name]))
            ? JSON.stringify([table.schema, fk.targetTable.name])
            : JSON.stringify([null, fk.targetTable.name]));
        const target = tables.get(targetKey);
        if (!target) { diagnostics.push(`No se encontró la tabla referenciada ${fk.targetTable.name} (desde ${table.name}).`); return; }
        const targetColumns = fk.targetColumns || target.primaryKey;
        if (!targetColumns || !targetColumns.length) { diagnostics.push(`No se pudo inferir la clave referenciada por ${table.name}.`); return; }
        if (fk.columns.length !== targetColumns.length) { diagnostics.push(`La FK de ${table.name} tiene distinto número de columnas que ${target.name}.`); return; }
        const oneToOne = table.uniqueConstraints.some(keys => sameColumnSet(keys, fk.columns));
        fk.columns.forEach((fromCol, index) => {
          const column = table.columns.find(item => item.name === fromCol);
          const targetColumn = target.columns.find(item => item.name === targetColumns[index]);
          if (!column || !targetColumn) { diagnostics.push(`No se encontró una columna de la FK entre ${table.name} y ${target.name}.`); return; }
          column.isFk = true;
          links.push({ id: `link-${linkId++}`, fromTable: table.id, fromCol: column.name, toTable: target.id, toCol: targetColumn.name, color: '#38bdf8', width: 2, style: 'solid', cardinality: oneToOne ? '1:1' : '1:N' });
        });
      });
    });
    return { tables, links, diagnostics };
  }

  root.SqlParser = Object.freeze({ parse });
})(window);
