"use strict";

/* global SimpleKeyboard */

if (navigator.userAgent.includes("BrightSign")) {

    const keyboardContainer = document.createElement("div");
    keyboardContainer.className = "simple-keyboard";
    document.body.appendChild(keyboardContainer);

    // Load the CSS file
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/simple-keyboard/build/css/index.css";
    document.head.appendChild(link);

    // Inject CSS styles
    const style = document.createElement("style");
    style.innerHTML = `
    .simple-keyboard {
        position: fixed;
        bottom: -100%;
        left: 0;
        width: 100%;
        max-width: 1200px;
        transition: bottom 0.3s ease-in-out;
        background: white;
        z-index: 9999;
    }
    .show-keyboard {
        bottom: 0;
    }
`;
    document.head.appendChild(style);

    // Load the SimpleKeyboard script dynamically
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/simple-keyboard/build/index.js";

    script.onload = () => {
        function dispatchKeyboardEvent(element, key) {
            const eventOptions = {key, code: `Key${key.toUpperCase()}`, bubbles: true};
            element.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
            element.dispatchEvent(new KeyboardEvent("keypress", eventOptions));
            element.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
        }

        function setupKeyboard(input) {
            const keyboard = new SimpleKeyboard.default({
                onKeyPress: key => {
                    if (key === "{bksp}") {
                        input.value = input.value.slice(0, -1);
                    } else if (key === "{space}") {
                        input.value += " ";
                    } else if (key === "{clear}") {
                        input.value = "";
                    } else {
                        input.value += key;
                    }

                    // Keep input focused
                    setTimeout(() => input.focus(), 0);

                    // Simulate keyboard events
                    if (key !== "{clear}") {
                        dispatchKeyboardEvent(input, key);
                    }
                },
                layout: {
                    default: [
                        "q w e r t y u i o p",
                        "a s d f g h j k l",
                        "z x c v b n m {bksp}",
                        "{space} {clear}"
                    ]
                },
                display: {
                    "{bksp}": "⌫",
                    "{space}": "␣",
                    "{clear}": "Clear"
                }
            });

            // Show keyboard when input is focused
            input.addEventListener("focus", () => {
                keyboardContainer.classList.add("show-keyboard");
            });

            // Prevent losing focus when clicking on the keyboard
            keyboardContainer.addEventListener("mousedown", (e) => {
                e.preventDefault(); // Prevent focus loss
                input.focus();
            });

            // Close keyboard when clicking outside
            document.addEventListener("click", (e) => {
                if (!keyboardContainer.contains(e.target) && e.target !== input) {
                    keyboardContainer.classList.remove("show-keyboard");
                }
            });
        }

        const input = document.getElementById("fli-imerss-autocomplete");
        if (input) {
            setupKeyboard(input);
        } else {
            // Use MutationObserver to detect when the input appears
            const observer = new MutationObserver(() => {
                const input = document.getElementById("fli-imerss-autocomplete");
                if (input) {
                    setupKeyboard(input);
                    observer.disconnect(); // Stop observing once found
                }
            });

            observer.observe(document.body, {childList: true, subtree: true});
        }
    };

    document.head.appendChild(script);

}
