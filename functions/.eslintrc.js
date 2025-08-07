module.exports = {
    root: true,
    env: {
        es6: true,
        node: true,
    },
    extends: [
        "eslint:recommended",
    ],
    rules: {
        quotes: ["error", "double"],
        "indent": ["error", 4],
    },
    parserOptions: {
        ecmaVersion: 2020,
    },
};
