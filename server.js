/*global require,process,console*/

var CONFIG = {
    port: 8081,
    dictionary: "dictionary.json",
    interval: 1000
};

(function () {
    "use strict";

    var WebSocketServer = require('ws').Server,
        fs = require('fs'),
        wss = new WebSocketServer({ port: CONFIG.port }),
        dictionary = JSON.parse(fs.readFileSync(CONFIG.dictionary, "utf8")),
        cabin = {
            "sns.temp": 22,
            "prop.aircon": "OFF",
            "comms.recd": 0,
            "comms.sent": 0
        },
        histories = {},
        listeners = [];

    function updateCabin() {
        cabin["sns.temp"] = Math.max(
            0,
            cabin["sns.temp"] -
                (cabin["prop.aircon"] === "ON" ? 0.02 : 0)
        );
    }

    function generateTelemetry() {
        var timestamp = Date.now(), sent = 0;
        Object.keys(cabin).forEach(function (id) {
            var state = { timestamp: timestamp, value: cabin[id] };
            histories[id] = histories[id] || []; // Initialize
            histories[id].push(state);
            cabin["comms.sent"] += JSON.stringify(state).length;
        });
        listeners.forEach(function (listener) {
            listener();
        });
    }

    function update() {
        updateCabin();
        generateTelemetry();
    }

    function handleConnection(ws) {
        var subscriptions = {}, // Active subscriptions for this connection
            handlers = {        // Handlers for specific requests
                dictionary: function () {
                    ws.send(JSON.stringify({
                        type: "dictionary",
                        value: dictionary
                    }));
                },
                subscribe: function (id) {
                    subscriptions[id] = true;
                },
                unsubscribe: function (id) {
                    delete subscriptions[id];
                },
                history: function (id) {
                    ws.send(JSON.stringify({
                        type: "history",
                        id: id,
                        value: histories[id]
                    }));
                }
            };

        function notifySubscribers() {
            Object.keys(subscriptions).forEach(function (id) {
                var history = histories[id];
                if (history) {
                    ws.send(JSON.stringify({
                        type: "data",
                        id: id,
                        value: history[history.length - 1]
                    }));
                }
            });
        }

        // Listen for requests
        ws.on('message', function (message) {
            var parts = message.split(' '),
                handler = handlers[parts[0]];
            if (handler) {
                handler.apply(handlers, parts.slice(1));
            }
        });

        // Stop sending telemetry updates for this connection when closed
        ws.on('close', function () {
            listeners = listeners.filter(function (listener) {
                return listener !== notifySubscribers;
            });
        });

        // Notify subscribers when telemetry is updated
        listeners.push(notifySubscribers);
    }

    update();
    setInterval(update, CONFIG.interval);

    wss.on('connection', handleConnection);

    console.log("Example cabin running on port ");
    console.log("Press Enter to toggle aircon state.");
    process.stdin.on('data', function (data) {
        cabin['prop.aircon'] =
            (cabin['prop.aircon'] === "OFF") ? "ON" : "OFF";
        console.log("aircon " + cabin["prop.aircon"]);
    });
}());