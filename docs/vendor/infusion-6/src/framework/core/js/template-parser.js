"use strict";

/*!
 * Adapted from https://github.com/vuejs/vue/blob/dev/src/compiler/parser/html-parser.js
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

// import fluid from "./Fluid.js"

const htmlParserScope = function (fluid) {

    const NODE_ENV = "development";
    /*
     * Make a map and return a function for checking if a key
     * is in that map.
     * @param str
     * @param expectsLowerCase
     */
    function makeMap(str, expectsLowerCase) {
        const map = Object.create(null);
        const list = str.split(",");
        for (let i = 0; i < list.length; i++) {
            map[list[i]] = true;
        }
        return expectsLowerCase
            ? val => map[val.toLowerCase()]
            : val => map[val];
    }

    /*
     * Create a cached version of a pure function of a string
     */
    fluid.stringCache = function (fn) {
        const cache = Object.create(null);
        return (function cachedFn(str) {
            const hit = cache[str];
            return hit || (cache[str] = fn(str));
        });
    };

    function isTextTag(el) {
        return el.tag === "script" || el.tag === "style";
    };

    let decoder;

    function decodeEntity(html) {
        decoder = decoder || document.createElement("div");
        decoder.innerHTML = html;
        return decoder.textContent;
    }

    if (typeof(document) !== "undefined") {
        fluid.decodeHtmlEntity = fluid.stringCache(decodeEntity);
        // On the server defined in server-support.js
    }

    // HTML5 tags https://html.spec.whatwg.org/multipage/indices.html#elements-3
    // Phrasing Content https://html.spec.whatwg.org/multipage/dom.html#phrasing-content
    const isNonPhrasingTag = makeMap(
        "address,article,aside,base,blockquote,body,caption,col,colgroup,dd," +
        "details,dialog,div,dl,dt,fieldset,figcaption,figure,footer,form," +
        "h1,h2,h3,h4,h5,h6,head,header,hgroup,hr,html,legend,li,menuitem,meta," +
        "optgroup,option,param,rp,rt,source,style,summary,tbody,td,tfoot,th,thead," +
        "title,tr,track"
    );

    const isUnaryTag = makeMap("area,base,br,col,embed,frame,hr,img,input,isindex,keygen,link,meta,param,source,track,wbr");

    // Elements that you can, intentionally, leave open
    // (and which close themselves)
    const canBeLeftOpenTag = makeMap("colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr,source");

    /**
     * unicode letters used for parsing html tags, component names and property paths.
     * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
     * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
     */
    const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/;


    // Regular Expressions for parsing tags and attributes
    const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
    const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
    const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`;
    const qnameCapture = `((?:${ncname}\\:)?${ncname})`;
    const startTagOpen = new RegExp(`^<${qnameCapture}`);
    const startTagClose = /^\s*(\/?)>/;
    const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`);
    const doctype = /^<!DOCTYPE [^>]+>/i;
    // #7298: escape - to avoid being passed as HTML comment when inlined in page
    const comment = /^<!\--/;
    const conditionalComment = /^<!\[/;

    // Special Elements (can contain anything)
    const isPlainTextElement = makeMap("script,style,textarea", true);
    const reCache = {};

    const decodingMap = {
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": "\"",
        "&amp;": "&",
        "&#10;": "\n",
        "&#9;": "\t",
        "&#39;": "'"
    };
    const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g;

    // #5992
    const isIgnoreNewlineTag = makeMap("pre,textarea", true);
    const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === "\n";

    function decodeAttr(value) {
        return value.replace(encodedAttr, match => decodingMap[match]);
    }

    fluid.parseHTMLToStream = function (html, options) {
        const stack = [];
        const expectHTML = options.expectHTML;
        let index = 0;
        let last, lastTag;
        while (html) {
            last = html;
            // Make sure we're not in a plaintext content element like script/style
            if (!lastTag || !isPlainTextElement(lastTag)) {
                let textEnd = html.indexOf("<");
                if (textEnd === 0) {
                    // Comment:
                    if (comment.test(html)) {
                        const commentEnd = html.indexOf("-->");

                        if (commentEnd >= 0) {
                            if (options.shouldKeepComment) {
                                options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3);
                            }
                            advance(commentEnd + 3);
                            continue;
                        }
                    }

                    // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
                    if (conditionalComment.test(html)) {
                        const conditionalEnd = html.indexOf("]>");

                        if (conditionalEnd >= 0) {
                            advance(conditionalEnd + 2);
                            continue;
                        }
                    }

                    // Doctype:
                    const doctypeMatch = html.match(doctype);
                    if (doctypeMatch) {
                        advance(doctypeMatch[0].length);
                        continue;
                    }

                    // End tag:
                    const endTagMatch = html.match(endTag);
                    if (endTagMatch) {
                        const curIndex = index;
                        advance(endTagMatch[0].length);
                        parseEndTag(endTagMatch[1], curIndex, index);
                        continue;
                    }

                    // Start tag:
                    const startTagMatch = parseStartTag();
                    if (startTagMatch) {
                        handleStartTag(startTagMatch);
                        if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
                            advance(1);
                        }
                        continue;
                    }
                }

                let text, rest, next;
                if (textEnd >= 0) {
                    rest = html.slice(textEnd);
                    while (
                        !endTag.test(rest) &&
                        !startTagOpen.test(rest) &&
                        !comment.test(rest) &&
                        !conditionalComment.test(rest)
                    ) {
                        // < in plain text, be forgiving and treat it as text
                        next = rest.indexOf("<", 1);
                        if (next < 0) {break;}
                        textEnd += next;
                        rest = html.slice(textEnd);
                    }
                    text = html.substring(0, textEnd);
                }

                if (textEnd < 0) {
                    text = html;
                }

                if (text) {
                    advance(text.length);
                }

                if (options.chars && text) {
                    options.chars(text, index - text.length, index);
                }
            } else {
                let endTagLength = 0;
                const stackedTag = lastTag.toLowerCase();
                const reStackedTag =
                    reCache[stackedTag] ||
                    (reCache[stackedTag] = new RegExp("([\\s\\S]*?)(</" + stackedTag + "[^>]*>)", "i"));
                const rest = html.replace(reStackedTag, function (all, text, endTag, offset) {
                    endTagLength = endTag.length;

                    const textStart = index + offset;
                    const textEnd = textStart + text.length;

                    let processedText = text;
                    if (!isPlainTextElement(stackedTag) && stackedTag !== "noscript") {
                        processedText = processedText
                            .replace(/<!\--([\s\S]*?)-->/g, "$1")
                            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1");
                    }
                    if (shouldIgnoreFirstNewline(stackedTag, processedText)) {
                        processedText = processedText.slice(1);
                    }
                    if (options.chars) {
                        options.chars(processedText, textStart, textEnd);
                    }
                    return "";
                });
                index += html.length - rest.length;
                html = rest;
                parseEndTag(stackedTag, index - endTagLength, index);
            }

            if (html === last) {
                options.chars && options.chars(html);
                if (NODE_ENV !== "production" && !stack.length && options.warn) {
                    options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length });
                }
                break;
            }
        }

        // Clean up any remaining tags
        parseEndTag();

        function advance(n) {
            index += n;
            html = html.substring(n);
        }

        function parseStartTag() {
            const start = html.match(startTagOpen);
            if (start) {
                const match = {
                    tagName: start[1],
                    attrs: [],
                    start: index
                };
                advance(start[0].length);
                let end, attr;
                while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
                    attr.start = index;
                    advance(attr[0].length);
                    attr.end = index;
                    match.attrs.push(attr);
                }
                if (end) {
                    match.unarySlash = end[1];
                    advance(end[0].length);
                    match.end = index;
                    return match;
                }
            }
        }

        function handleStartTag(match) {
            const tagName = match.tagName;
            const unarySlash = match.unarySlash;

            if (expectHTML) {
                if (lastTag === "p" && isNonPhrasingTag(tagName)) {
                    parseEndTag(lastTag);
                }
                if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
                    parseEndTag(tagName);
                }
            }

            const unary = isUnaryTag(tagName) || !!unarySlash;

            const l = match.attrs.length;
            const attrs = {};
            for (let i = 0; i < l; i++) {
                const args = match.attrs[i];
                const name = args[1];
                const value = args[3] || args[4] || args[5] || "";
                attrs[name] = decodeAttr(value);
            }

            if (!unary) {
                stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end });
                lastTag = tagName;
            }

            if (options.start) {
                options.start(tagName, attrs, unary, match.start, match.end);
            }
        }

        function parseEndTag(tagName, start, end) {
            let pos, lowerCasedTagName;
            if (start == null) {start = index;}
            if (end == null) {end = index;}

            // Find the closest opened tag of the same type
            if (tagName) {
                lowerCasedTagName = tagName.toLowerCase();
                for (pos = stack.length - 1; pos >= 0; pos--) {
                    if (stack[pos].lowerCasedTag === lowerCasedTagName) {
                        break;
                    }
                }
            } else {
                // If no tag name is provided, clean shop
                pos = 0;
            }

            if (pos >= 0) {
                // Close all the open elements, up the stack
                for (let i = stack.length - 1; i >= pos; i--) {
                    if (NODE_ENV !== "production" &&
                        (i > pos || !tagName) &&
                        options.warn
                    ) {
                        options.warn(
                            `tag <${stack[i].tag}> has no matching end tag.`,
                            { start: stack[i].start, end: stack[i].end }
                        );
                    }
                    if (options.end) {
                        options.end(stack[i].tag, start, end);
                    }
                }

                // Remove the open elements from the stack
                stack.length = pos;
                lastTag = pos && stack[pos - 1].tag;
            } else if (lowerCasedTagName === "br") {
                if (options.start) {
                    options.start(tagName, [], true, start, end);
                }
            } else if (lowerCasedTagName === "p") {
                if (options.start) {
                    options.start(tagName, [], false, start, end);
                }
                if (options.end) {
                    options.end(tagName, start, end);
                }
            }
        }
    };

    fluid.isWhitespace = function (text) {
        return /^\s*$/.test(text);
    };

    fluid.parseHTMLToTree = function (html, options = {fragment: true, skipWhitespace: true}) {
        const stack = [];
        let root;
        let currentParent;
        if (options.fragment) {
            root = {tag: "fragment", children: []};
            stack.push(root);
            currentParent = root;
        }

        const closeElement = element => {
            if (currentParent) {
                currentParent.children.push(element);
            }
        };

        const innerOptions = Object.assign({
            start: (tag, attrs, unary, start, end) => {
                let element = {tag, attrs, children: [], start, end};
                if (!unary) {
                    if (!root) {
                        root = element;
                    }
                    stack.push(element);
                    currentParent = element;
                } else {
                    closeElement(element);
                }
            },
            end: (tag, start, end) => {
                const element = stack.pop();
                currentParent = fluid.peek(stack);
                element.end = end;
                closeElement(element);
            },
            chars: (text, start, end) => {
                const children = currentParent?.children;

                if (text && children) {
                    const isWhitespace = fluid.isWhitespace(text);
                    if (options.skipWhitespace && isWhitespace) {
                        return;
                    }
                    const decoded = isTextTag(currentParent) ? text : fluid.decodeHtmlEntity(text);
                    const prev = children[children.length - 1];

                    if (!isWhitespace || !children.length || !fluid.isWhitespace(prev?.text)) {
                        const child = {
                            type: 3,
                            text: decoded,
                            start,
                            end
                        };
                        children.push(child);
                    }
                }
            },
            comment(text, start, end) {
                if (currentParent) {
                    const child = {
                        type: 3,
                        text,
                        isComment: true
                    };
                    child.start = start;
                    child.end = end;
                    currentParent.children.push(child);
                }
            }

        }, options);
        fluid.parseHTMLToStream(html, innerOptions);
        return root;
    };

};

if (typeof(fluid) !== "undefined") {
    htmlParserScope(fluid);
}
