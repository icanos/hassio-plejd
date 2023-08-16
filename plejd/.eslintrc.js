// const path = require('path');

// {
//   "extends": ["airbnb-base", "plugin:prettier/recommended"],
//   "plugins": ["prettier"],
//   "rules": {
//     "prettier/prettier": "error"
//   }
// }

// eslint-disable-next-line no-undef
module.exports = {
  root: true,
  extends: [
    'airbnb-base',
    'eslint-config-prettier', // Prefers Prettier's formatting
    // 'prettier',
    // 'plugin:prettier/recommended'
  ],
  parser: 'babel-eslint',
  // plugins: ['prettier'],
  rules: getRules(),
};

function getRules() {
  return {
    'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
    // Allows modification of properties passed to functions.
    // Notably used in array.forEach(e => {e.prop = val;})
    'no-param-reassign': ['error', { props: false }],
    // ++ operator widely used
    'no-plusplus': ['off'],
    // Hassio-Plejd team feals _ prefix is great for "private" variables.
    // They will still be available for use from the outside
    'no-underscore-dangle': ['off'],
    // Allow function hoisting to improve code readability
    'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
    // Allow direct indexing of arrays only (array[0])
    'prefer-destructuring': ['error', { array: false, object: true }],
  };
}
