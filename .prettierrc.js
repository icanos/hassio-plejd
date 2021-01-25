module.exports = {
  endOfLine: 'lf',
  printWidth: 100,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  overrides: [
    {
      files: ['*.js'],
      options: {
        trailingComma: 'all',
      },
    },
  ],
};
