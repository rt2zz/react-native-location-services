var RCTDeviceEventEmitter = require('RCTDeviceEventEmitter')
var RCTLocationServices = require('NativeModules').LocationServices
var _ = require('lodash')

var invariant = require('invariant')
var logError = require('logError')
var warning = require('warning')

var subscriptions = []
var geofenceCount = 0
var geofenceIDCounter = 0
var geofences = {}
var listeningForGeofenceEvents = false

var updatesEnabled = false

var LocationServices = {

  getCurrentPosition: function(
    geo_success: Function,
    geo_error?: Function,
    geo_options?: GeoOptions
  ) {
    invariant(
      typeof geo_success === 'function',
      'Must provide a valid geo_success callback.'
    )
    RCTLocationServices.getCurrentPosition(
      geo_options || {},
      geo_success,
      geo_error || logError
    )
  },

  watchPosition: function(success: Function, error?: Function, options?: GeoOptions): number {
    if (!updatesEnabled) {
      RCTLocationServices.startObserving(options || {})
      updatesEnabled = true
    }
    var watchID = subscriptions.length
    subscriptions.push([
      RCTDeviceEventEmitter.addListener(
        'geolocationDidChange',
        success
      ),
      error ? RCTDeviceEventEmitter.addListener(
        'geolocationError',
        error
      ) : null,
    ])
    return watchID
  },

  clearWatch: function(watchID: number) {
    var sub = subscriptions[watchID]
    if (!sub) {
      // Silently exit when the watchID is invalid or already cleared
      // This is consistent with timers
      return
    }

    sub[0].remove()
    // array element refinements not yet enabled in Flow
    var sub1 = sub[1]
    sub1 && sub1.remove()
    subscriptions[watchID] = undefined
    var noWatchers = true
    for (var ii = 0; ii < subscriptions.length; ii++) {
      if (subscriptions[ii]) {
        noWatchers = false // still valid subscriptions
      }
    }
    if (noWatchers) {
      LocationServices.stopObserving()
    }
  },

  stopObserving: function() {
    if (updatesEnabled) {
      RCTLocationServices.stopObserving()
      updatesEnabled = false
      for (var ii = 0; ii < subscriptions.length; ii++) {
        var sub = subscriptions[ii]
        if (sub) {
          warning('Called stopObserving with existing subscriptions.')
          sub[0].remove()
          // array element refinements not yet enabled in Flow
          var sub1 = sub[1]
          sub1 && sub1.remove()
        }
      }
      subscriptions = []
    }
  },

  geofence: function(geofence) {
    geofenceCount += 1
    var identifier = geofence.identifier || '_'+Math.floor(Math.random()*999999999)
    this._listenForGeofenceEvents()

    var options = geofence
    options.identifier = identifier
    geofences[identifier] = options
    RCTLocationServices.setGeofence(options)
  },

  removeGeofence: function(id){
    RCTLocationServices.removeGeofence(geofences[id])
    delete geofences[id]
    geofenceCount -= 1
  },

  _listenForGeofenceEvents: function(){
    if(listeningForGeofenceEvents){ return }
    //clear out old geofences
    RCTLocationServices.clearAllGeofences()
    listeningForGeofenceEvents = true
    RCTDeviceEventEmitter.addListener(
      'geofenceDidEnter',
      (event) => {
        var id = event.identifier
        if(!geofences[id]){
          console.warn('WARNING: no geofence for', event.identifier)
          return
        }
        geofences[id].onDidEnter && geofences[id].onDidEnter()
      }
    )
    RCTDeviceEventEmitter.addListener(
      'geofenceDidExit',
      (event) => {
        var id = event.identifier
        if(!geofences[id]){
          console.warn('WARNING: no geofence for', event.identifier)
          return
        }
        geofences[id].onDidExit && geofences[id].onDidExit()
        if(geofences[id].expireOnExit){
          this.removeGeofence(id)
        }
      }
    )
  },

  clearAllGeofences: function(){
    RCTLocationServices.clearAllGeofences()
  },

  monitoredRegions: function(cb){
    RCTLocationServices.monitoredRegions(cb)
  },

  isPositionMonitored: function(position){
    var hit = false
    _.each(geofences, (geofence, id) => {
      //if position is inside of the geofence
      if(computeDistanceBetweenCoords(position.coords, geofence.coords) < geofence.radius){
        hit = true
        return false
      }
    })
    return hit
  },
}

module.exports = LocationServices

function computeDistanceBetweenCoords(coords1, coords2){  // generally used geo measurement function
  var R = 6378.137; // Radius of earth in KM
  var dLat = (coords2.latitude - coords1.latitude) * Math.PI / 180;
  var dLon = (coords2.longitude - coords1.longitude) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
  Math.cos(coords1.latitude * Math.PI / 180) * Math.cos(coords2.latitude * Math.PI / 180) *
  Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c;
  return d * 1000;
}
