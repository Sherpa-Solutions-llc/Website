export default [
    {
        ignores: ["node_modules/**"]
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                localStorage: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                fetch: "readonly",
                alert: "readonly",
                confirm: "readonly",
                Math: "readonly",
                JSON: "readonly",
                L: "readonly",
                Cesium: "readonly",
                require: "readonly"
            }
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": "warn"
        }
    }
];
