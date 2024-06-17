/* global preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed} = preactSignalsCore;

const testDOMSpeed = function (its) {
    const array = [];
    for (let i = 0; i < its; ++i) {
        const element = document.createElement("div");
        element.setAttribute("t1", "" + i);
        element.setAttribute("t2", "" + i);
        element.setAttribute("t3", "" + i);
        element.setAttribute("t4", "" + i);
        element.setAttribute("t5", "" + i);
        element.setAttribute("t6", "" + i);
        array.push(element);
    }
    return array;
};

const testSignalSpeed = function (its) {
    const array = [];
    array[0] = signal(-1);
    for (let i = 1; i < its; ++i) {
        const preds = [...Array(3).keys()].map(() => array[Math.floor(Math.random() * i)]);
        const element = computed( () => 1 + preds.reduce((p, s) => p + s.value, 0));
        array.push(element);
    }

    const now = Date.now();
    ++array[0].value;
    console.log("Computed final signal value ", array[its - 1].value);
    const delay = Date.now() - now;
    console.log(its + " computations in " + delay + " ms: " + 1000 * (delay / its) + " us/it");
    return array;
};

const testJSONSpeed = function (its) {
    const array = [];
    for (let i = 0; i < its; ++i) {
        const element = {};
        element.t1 = "" + i;
        element.t2 = "" + i;
        element.t3 = "" + i;
        element.t4 = "" + i;
        element.t5 = "" + i;
        element.t6 = "" + i;
        array.push(element);
    }
    return array;
};

const clone = function (toclone) {
    const togo = {};
    for (let key in toclone) {
        togo[key] = toclone[key];
    }
    return togo;
};

const timeIt = function (its, fn, name) {
    const now = Date.now();
    const oldShot = clone(performance.memory);
    const value = fn(its);
    const delay = Date.now() - now;
    const newShot = performance.memory;
    const bytes = newShot.usedJSHeapSize - oldShot.usedJSHeapSize;
    console.log("Testing allocation of " + name);
    console.log(its + " iterations in " + delay + " ms: " + 1000 * (delay / its) + " us/it");
    console.log("Used heap size " + bytes + ": " + (bytes / its) + " bytes per object");
    console.log("Oldshot" , oldShot);
    console.log("Newshot", newShot);
    return value;
};

function testSpeed() {
    timeIt(1000000, testSignalSpeed, "signals");
    timeIt(1000000, testDOMSpeed, "DOM nodes");
    timeIt(10000000, testJSONSpeed, "JSON objects");
}

document.getElementById("run-tests").addEventListener("click", testSpeed);
