/* Resaltado SQL ligero para el editor local, sin dependencias externas. */
(function (root) {
  'use strict';

  const KEYWORDS = new Set([
    'ADD', 'ALL', 'ALTER', 'ANALYZE', 'AS', 'ASC', 'BEGIN', 'BY', 'CASCADE', 'CASE', 'CHECK',
    'COLUMN', 'COMMIT', 'CONFLICT', 'CONSTRAINT', 'CREATE', 'CROSS', 'CURRENT_DATE',
    'CURRENT_TIMESTAMP', 'DATABASE', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DO', 'DROP',
    'ELSE', 'END', 'EXCEPT', 'EXISTS', 'EXPLAIN', 'FALSE', 'FETCH', 'FOR', 'FOREIGN', 'FROM',
    'FULL', 'FUNCTION', 'GENERATED', 'GRANT', 'GROUP', 'HAVING', 'ILIKE', 'IF', 'IN', 'INDEX',
    'INNER', 'INSERT', 'INTERSECT', 'INTO', 'IS', 'JOIN', 'KEY', 'LANGUAGE', 'LEFT', 'LIKE',
    'LIMIT', 'LOCAL', 'MATERIALIZED', 'NOT', 'NULL', 'OFFSET', 'ON', 'ONLY', 'OR', 'ORDER',
    'OUTER', 'OVER', 'PARTITION', 'PRIMARY', 'PROCEDURE', 'RECURSIVE', 'REFERENCES', 'RENAME',
    'RESTRICT', 'RETURNING', 'RIGHT', 'ROLLBACK', 'SCHEMA', 'SELECT', 'SET', 'TABLE', 'TEMP',
    'TEMPORARY', 'THEN', 'TO', 'TRUNCATE', 'TRUE', 'UNION', 'UNIQUE', 'UPDATE', 'USE', 'USING',
    'VALUES', 'VIEW', 'WHEN', 'WHERE', 'WINDOW', 'WITH'
  ]);

  const TYPES = new Set([
    'BIGINT', 'BIGSERIAL', 'BIT', 'BOOLEAN', 'BOOL', 'BYTEA', 'CHAR', 'CHARACTER',
    'DATE', 'DECIMAL', 'DOUBLE', 'FLOAT', 'INT', 'INT2', 'INT4', 'INT8', 'INTEGER',
    'INTERVAL', 'JSON', 'JSONB', 'MONEY', 'NUMERIC', 'REAL', 'SERIAL', 'SERIAL2',
    'SERIAL4', 'SERIAL8', 'SMALLINT', 'SMALLSERIAL', 'TEXT', 'TIME', 'TIMESTAMP',
    'UUID', 'VARBIT', 'VARCHAR', 'XML'
  ]);

  const FUNCTIONS = new Set([
    'ABS', 'ARRAY_AGG', 'AVG', 'COALESCE', 'CONCAT', 'COUNT', 'DATE_PART', 'DATE_TRUNC',
    'EXTRACT', 'GREATEST', 'JSON_AGG', 'JSONB_AGG', 'JSONB_BUILD_OBJECT', 'JSON_BUILD_OBJECT',
    'LEAST', 'LOWER', 'MAX', 'MIN', 'NOW', 'NULLIF', 'POSITION', 'ROUND', 'STRING_AGG',
    'SUBSTRING', 'SUM', 'TO_CHAR', 'TO_DATE', 'TO_TIMESTAMP', 'TRIM', 'UPPER', 'UUID_GENERATE_V4'
  ]);

  const TOKEN_COLORS = Object.freeze({
    'sql-token-comment': '#6a9955',
    'sql-token-string': '#ce9178',
    'sql-token-identifier': '#9cdcfe',
    'sql-token-number': '#b5cea8',
    'sql-token-keyword': '#569cd6',
    'sql-token-type': '#4ec9b0',
    'sql-token-function': '#dcdcaa'
  });

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function findQuotedEnd(source, start, quote, escapeBackslashes = false) {
    let index = start + 1;
    while (index < source.length) {
      if (escapeBackslashes && source[index] === '\\') { index += 2; continue; }
      if (source[index] === quote && source[index + 1] === quote) { index += 2; continue; }
      if (source[index] === quote) return index + 1;
      index++;
    }
    return source.length;
  }

  function findDollarDelimiter(source, start) {
    const match = source.slice(start).match(/^\$[A-Za-z_0-9]*\$/);
    return match ? match[0] : null;
  }

  function highlight(sql) {
    const source = String(sql || '');
    const output = [];
    let index = 0;

    while (index < source.length) {
      const start = index;
      let className = '';
      const current = source[index];

      if (current === '-' && source[index + 1] === '-') {
        className = 'sql-token-comment';
        const newline = source.indexOf('\n', index);
        index = newline < 0 ? source.length : newline;
      } else if (current === '/' && source[index + 1] === '*') {
        className = 'sql-token-comment';
        const close = source.indexOf('*/', index + 2);
        index = close < 0 ? source.length : close + 2;
      } else if (current === '$' && findDollarDelimiter(source, index)) {
        className = 'sql-token-string';
        const delimiter = findDollarDelimiter(source, index);
        const close = source.indexOf(delimiter, index + delimiter.length);
        index = close < 0 ? source.length : close + delimiter.length;
      } else if ((current === 'E' || current === 'e') && source[index + 1] === "'" &&
        (index === 0 || !/[A-Za-z0-9_$]/.test(source[index - 1]))) {
        className = 'sql-token-string';
        index = findQuotedEnd(source, index + 1, "'", true);
      } else if (current === "'") {
        className = 'sql-token-string';
        index = findQuotedEnd(source, index, "'");
      } else if (current === '"') {
        className = 'sql-token-identifier';
        index = findQuotedEnd(source, index, '"');
      } else if (/\d/.test(current) && (index === 0 || !/[A-Za-z_$]/.test(source[index - 1]))) {
        className = 'sql-token-number';
        index++;
        while (index < source.length && /[\d.]/.test(source[index])) index++;
      } else if (/[A-Za-z_]/.test(current)) {
        index++;
        while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index++;
        const word = source.slice(start, index).toUpperCase();
        if (KEYWORDS.has(word)) className = 'sql-token-keyword';
        else if (TYPES.has(word)) className = 'sql-token-type';
        else if (FUNCTIONS.has(word)) className = 'sql-token-function';
      } else {
        index++;
      }

      const token = escapeHtml(source.slice(start, index));
      const color = TOKEN_COLORS[className];
      output.push(className
        ? `<span class="${className}" style="color:${color}">${token}</span>`
        : token);
    }

    // Preserve a final empty line so the visual layer tracks the textarea caret.
    if (source.endsWith('\n')) output.push(' ');
    return output.join('');
  }

  root.SqlHighlighter = Object.freeze({ highlight });
})(window);
