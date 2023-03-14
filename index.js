/* eslint-env node */
"use strict";

const fluid = require("infusion");
console.log("INDEX LOADED");

fluid.module.register("imerss-bioinfo", __dirname, require);
