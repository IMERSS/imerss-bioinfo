/* eslint-env node */

"use strict";

const fluid = require("infusion");

const Jsep = require("./jsep.js");

const hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.expr");

hortis.expr.binops = {
    "+" : function (a, b) { return a + b; },
    "-" : function (a, b) { return a - b; },
    "*" : function (a, b) { return a * b; },
    "/" : function (a, b) { return a / b; },
    "==" : function (a, b) { return a === b; },
    "===" : function (a, b) { return a === b; },
    "!=" : function (a, b) { return a !== b; },
    "!==" : function (a, b) { return a !== b; },
    "||" : function (a, b) { return a || b; },
    "&&" : function (a, b) { return a && b; },
    "%" : function (a, b) { return a % b; }
};

hortis.expr.evaluate = function (node, scope) {
    if (node.type === "Literal") {
        return node.value;
    } else if (node.type === "Identifier") {
        if (node.name in scope) {
            return scope[node.name];
        } else {
            fluid.fail("Name " + node.name + " is not found in scope - possible values are " + Object.keys(scope).join(", "));
        }
    } else if (node.type === "BinaryExpression") {
        const opfunc = hortis.expr.binops[node.operator];
        if (!opfunc) {
            fluid.fail("Unknown binary operator " + node.operator + " - possible values are " + Object.keys(hortis.expr.binops).join(", "));
        }
        const left = hortis.expr.evaluate(node.left, scope);
        const right = hortis.expr.evaluate(node.right, scope);
        return opfunc(left, right);
    } else {
        fluid.fail("Unknown node type " + node.type);
    }
};

hortis.expr.parse = function (expr) {
    return new Jsep(expr).parse();
};

/*
var expr = "genus === \"Rabeleria\"";

var parsed = jsep(expr);

console.log(parsed);

var evaluated = hortis.expr.evaluate(parsed, {
    genus: "Rabeleria"
});

console.log("Evaluted to " + evaluated);
*/
