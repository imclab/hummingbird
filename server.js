var sys = require('sys'),
    http = require('http'),
    fs = require('fs'),
    path = require('path'),
    ws = require('./vendor/ws'),
    proxy = require('./lib/proxy'),
    pageview = require('./lib/view'),
    querystring = require('querystring'),
    arrays = require('./vendor/arrays'),
    paperboy = require('./vendor/node-paperboy'),
    mongo = require('./vendor/node-mongodb-native/lib/mongodb');

var WEBROOT = path.join(path.dirname(__filename), 'public'),
    TRACKING_PORT = 8000,
    WEB_SOCKET_PORT = 8080,
    MONITOR_PORT = 8088;

var db = new mongo.Db('hummingbird', new mongo.Server('localhost', 27017, {}), {});

var clients = [];

var urls = { total: 0 };
var sales = {};

setInterval(function() {
  clients.each(function(c) {
    try {
      c.write(JSON.stringify({total: urls.total}));
    } catch(e) {
      sys.log(e.description);
    }
  });

  urls = { total: 0 };
}, 50);

setInterval(function() {
  // sys.puts("Writing to clients...");

  clients.each(function(c) {
    try {
      c.write(JSON.stringify({sales: sales}));
    } catch(e) {
      sys.log(e.description);
    }
  });

  sales = {};
}, 500);

var pixel = fs.readFileSync("images/tracking.gif", 'binary');
db.open(function(db) {
  db.collection('visits', function(err, collection) {
    http.createServer(function (req, res) {

      var env = querystring.parse(req.url.split('?')[1]);
      env.timestamp = (new Date());
      collection.insert(env);
      // sys.puts(JSON.stringify(env, null, 2));

      res.writeHead(200, {'Content-Type': 'image/gif', 'Content-Disposition': 'inline'});
      res.write(pixel, 'binary');
      res.close();

      var view = new pageview.View(env);
      if(view.urlKey) {
        if(sales[view.urlKey]) {
          sales[view.urlKey] += 1;
        } else {
          sales[view.urlKey] = 1;
        }
      }
      urls.total += 1

    }).listen(TRACKING_PORT);
  });
});

sys.puts('Tracking server running at http://localhost:' + TRACKING_PORT + '/tracking_pixel.gif');

// Websocket TCP server
ws.createServer(function (websocket) {
  clients.push(websocket);

  websocket.addListener("connect", function (resource) {
    // emitted after handshake
    sys.log("ws connect: " + resource);
  }).addListener("close", function () {
    // emitted when server or client closes connection
    clients.remove(websocket);
    sys.log("ws close");
  });
}).listen(WEB_SOCKET_PORT);

sys.puts('Web Socket server running at ws://localhost:' + WEB_SOCKET_PORT);

try {
  http.createServer(function(req, res) {
    if(req.url.match(/\/sale_list/)) {
      sys.log("YAY");
      proxy.route("/sale_list", "http://www.gilt.com/pagegen_service/sales/sale_list", req, res);
    } else {
      paperboy.deliver(WEBROOT, req, res)
        .addHeader('Content-Type', "text/plain")
        .after(function(statCode) { sys.log([statCode, req.method, req.url, req.connection.remoteAddress].join(' ')); });
    }
  }).listen(MONITOR_PORT);

  sys.puts('Analytics server running at http://localhost:' + MONITOR_PORT + '/');
} catch(e) {
  if(e && e.message == "Address already in use") {
    sys.log('Detected port ' + MONITOR_PORT + ' in use; assuming it is being served by another webserver.');
  } else { throw(e); }
}