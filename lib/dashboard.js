var socketio     = require('socket.io');
var staticServer = require('node-static');
var Metric       = require('./metric');

var fileServer = new(staticServer.Server)("./public");

var defaultHandler = function(request, response) {
  console.log(" - " + request.url);
  fileServer.serve(request, response);
};

var server = require('http').createServer(defaultHandler);
var io = socketio.listen(server);
io.set("log level", 1);

if(config.origins) {
  io.set("origins", config.origins);
  console.log("Restricting dashboard websockets to " + config.origins + ".");
}

setInterval(function() {
  var userCount = Object.keys(io.sockets.sockets).length;
  console.log(userCount + " users connected.");
}, 60 * 1000);

Metric.loadMetrics(function(metric) {
  metric.on('data', function(metricName, data) {
    io.sockets.volatile.emit(metricName, data);
  });

  metric.start();
});

io.sockets.on('connection', function(socket) {
  for(var i = 0; i < Metric.all.length; i++) {
    var metric = Metric.all[i];
    // Send configuration to client
    socket.emit('config', metric.config());

    // Send backlog of events to prepopulate client
    metric.history.each(function(history) {
      socket.volatile.emit(metric.name, history);
    });
  }
});

module.exports = server;