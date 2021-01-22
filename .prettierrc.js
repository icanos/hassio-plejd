module.exports = {
  endOfLine: 'lf',
  printWidth: 100,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'none',
  overrides: [
    {
      files: '*.js, *.jsx',
      options: {
        trailingComma: 'all' // or es5
      }
    }
  ]
};
