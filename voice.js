// A voice interface to foursquare.
// Examples can be found in the help() function.


var DEBUGGING = false;

// common objects & functions
function LL(lat, lng) {
  this.lat = lat;
  this.lng = lng;

  this.toString = function() {
    return this.lat + ',' + this.lng;
  }

  // return the distance in degrees.
  this.distance = function(other) {
    var latD = other.lat - this.lat;
    var lngD = other.lng - this.lng;
    return Math.sqrt(latD*latD + lngD*lngD);
  }
}

function debug(obj) {
  console.log(new Date().toUTCString() + ": " + obj);
}

var token = null;
var apihost = null;
var webhost = null;

function getToken() {
  var prod = true;
  if (prod) {
    var client_id = 'DS04EIGWSV5MTURJIKMOSZLPUHA4SYE0FHUNYJ5BBGZPHKVE'; //prod
    apihost = 'api.foursquare.com';
    webhost = 'foursquare.com';
  } else {
    var client_id = 'DS04EIGWSV5MTURJIKMOSZLPUHA4SYE0FHUNYJ5BBGZPHKVE'; //prod
    apihost = 'api-ahogue-staging.foursquare.com';
    webhost = 'ahogue-staging.foursquare.com';
  }
  var callback_url = 'https://secondthought.org/fsq/voice/';

  /* Attempt to retrieve access token from URL. */
  if ($.bbq.getState('access_token')) {
    token = $.bbq.getState('access_token');
    $.bbq.pushState({access_token: token}, 0);
  } else {
    /* Redirect for foursquare authentication. */
    var url = 'https://' + webhost + '/oauth2/authenticate?client_id=' + client_id +
      '&response_type=token&redirect_uri=' + callback_url;
    window.location.href = url;
  }
}

var final_transcript = '';
var recognizing = false;
var ignore_onend;
var start_timestamp;
var recognition;

var start_button;
var start_img;
  
var map;
var markers = [];
var bounds = new google.maps.LatLngBounds();

function loadMap() {
  map = new google.maps.Map(document.getElementById('map_canvas'), {
    zoom: 2,
    center: new google.maps.LatLng(userLL.lat, userLL.lng),
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    disableDefaultUI: true
  });
}

function clearOutput() {
  document.getElementById('output').innerHTML = '';
  for (var ii = 0; ii < markers.length; ++ii) {
    markers[ii].setMap(null);
  }
  bounds = new google.maps.LatLngBounds();
}

// Key bindings for various controls.
$(document).bind('keydown', function(e) {
  if (!DEBUGGING) {
    if (e.which == 32) {   // <space> - start voice recognition.
      startButton(e);
      return false;
    } else if (e.which == 191) {  // '?' - show help
      toggleDiv('help');
    }
  }
});

function toggleDiv(id) {
  var div = document.getElementById(id);
  debug(div.style.display);
  if (div.style.display == 'none') {
    div.style.display = '';
  } else {
    div.style.display = 'none';
  }
}

var userLL = null;
function storeLocationAndLoadMap(position) {
  userLL = new LL(position.coords.latitude, position.coords.longitude);
  debug('got userLL: ' + userLL);
  loadMap();
}

function load() {
  getToken();

  if (DEBUGGING) {
    debug('debugging');
    document.getElementById('debug').style.display = '';
  }

  navigator.geolocation.getCurrentPosition(storeLocationAndLoadMap, function(msg) {debug(msg);},
                                           {maximumAge: 0, // always refresh.
                                            enableHighAccuracy: true});

  start_button = document.getElementById('start_button');
  start_img = document.getElementById('start_img');

  if (!('webkitSpeechRecognition' in window)) {
    upgrade();
  } else {
    start_button.style.display = 'inline-block';
    recognition = new webkitSpeechRecognition();

    // TODO: consider doing this in continuous mode.
    recognition.continuous = false;
    recognition.interimResults = false;
  
    recognition.onstart = function() {
      recognizing = true;
      start_img.src = 'mic-animate.gif';
    };
  
    recognition.onerror = function(event) {
      if (event.error == 'no-speech') {
        start_img.src = 'mic.gif';
        ignore_onend = true;
      }
      if (event.error == 'audio-capture') {
        start_img.src = 'mic.gif';
        ignore_onend = true;
      }
      if (event.error == 'not-allowed') {
        ignore_onend = true;
      }
    };
  
    recognition.onend = function() {
      recognizing = false;
      if (ignore_onend) {
        return;
      }
      start_img.src = 'mic.gif';
      if (!final_transcript) {
        return;
      }
      debug(final_transcript);
      parseQuery(final_transcript);
    };
  
    recognition.onresult = function(event) {
      var interim_transcript = '';
      for (var i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final_transcript += event.results[i][0].transcript;
        } else {
          interim_transcript += event.results[i][0].transcript;
        }
      }
      final_transcript = capitalize(final_transcript);
      final_span.innerHTML = final_transcript;
      interim_span.innerHTML = interim_transcript;
    };
  }
}

function debugSubmit() {
  final_span.innerHTML = capitalize(document.f.v.value);
  parseQuery(document.f.v.value);
}

function upgrade() {
  start_button.style.visibility = 'hidden';
}

var first_char = /\S/;
function capitalize(s) {
  return s.replace(first_char, function(m) { return m.toUpperCase(); });
}

function startButton(event) {
  if (recognizing) {
    recognition.stop();
    return;
  }
  final_transcript = '';
  recognition.lang = 'en-US';
  recognition.start();
  ignore_onend = false;
  final_span.innerHTML = '';
  interim_span.innerHTML = '';
  start_img.src = 'mic-slash.gif';
  start_timestamp = event.timeStamp;
}

function getDefault(dict, key, dflt) {
  if (key in dict) {
    return dict[key];
  } else {
    return dflt;
  }
}

function userToName(user) {
  return getDefault(user, 'firstName', '') + ' ' + getDefault(user, 'lastName', '');
}

function userToShortName(user) {
  var last = '';
  if ('lastName' in user) {
    last = ' ' + getDefault(user, 'lastName', '').substr(0, 1) + '.';
  }
  return getDefault(user, 'firstName', '') + last;
}

function doFindFriend(name) {
  var url = 'https://' + apihost + '/v2/users/self/friends' +
    '?oauth_token=' + token +
    '&v=20130415';
  debug(url);
  $.ajax({
    url: url,
    dataType: 'json',
    type: 'GET',
    error: function(data) {
      debug('Error: ' + JSON.stringify(data));
    },
    success: function(data) {
      var friends = data['response']['friends']['items'];
      for (var ii = 0; ii < friends.length; ++ii) {
        var searchStr = userToName(friends[ii]) + ' ' +
          getDefault(friends[ii]['contact'], 'twitter', '');
          
        if (searchStr.toLowerCase().indexOf(name) >= 0) {
          var id = friends[ii]['id'];
          doUser(id);
          return;
        }
      }
      document.getElementById('output').innerHTML = 'Couldn\'t find ' + name;
    }
  });
}

function time(date) {
  var pad = '';
  if (date.getMinutes() < 10) { pad = '0'; }
  return date.getHours() + ':' + pad + date.getMinutes();
}

function doUser(id) {
  var url = 'https://' + apihost + '/v2/users/' + id +
    '?oauth_token=' + token +
    '&v=20130415';
  debug(url);
  $.ajax({
    url: url,
    dataType: 'json',
    type: 'GET',
    error: function(data) {
      debug('Error: ' + JSON.stringify(data));
    },
    success: function(data) {
      var checkin = data['response']['user']['checkins']['items'][0];

      var output = '<div class=user><b>' + userToName(data['response']['user']) + '</b>';

      var date = new Date(checkin['createdAt'] * 1000);
      var now = new Date();
      var isOld = (now.getTime() - date.getTime() > (3 * 60 * 60 * 1000))
      if (isOld) {
        output += ' was at ';
      } else {
        output += ' is at ';
      }
      output += '<b>' + checkin['venue']['name'] + '</b> as of ' + time(date);
      if (isOld) {
        output += ' ' + date.toDateString();
      }

      if ('shout' in checkin) {
        output += '<br>';
        if (data['response']['user']['gender'] == 'female') {
          output += ' She was all like: "';
        } else {
          output += ' He was all like: <b>"';
        }
        output += checkin['shout'] + '"</b>';
      }
      output += '</div>';

      document.getElementById('output').innerHTML = output;

      var latlng = new google.maps.LatLng(checkin['venue']['location']['lat'],
                                          checkin['venue']['location']['lng']);
      var marker = new google.maps.Marker({
        position: latlng,
        map: map,
      });
      markers.push(marker);
      map.setCenter(latlng);
      map.setZoom(18);
    }
  });
}

function doExploreWithGeo(args, near) {
  if (near == 'here') {
    doExplore(args + '&ll=' + userLL.toString());
  } else {
    doExplore(args + '&near=' + escape(near));
  }
}

function doExplore(args) {
  var url = 'https://' + apihost + '/v2/venues/explore' +
    '?oauth_token=' + token +
    '&v=20130415' +
    args;
  debug(url);
  $.ajax({
    url: url,
    dataType: 'json',
    type: 'GET',
    error: function(data) {
      debug('Error: ' + JSON.stringify(data));
    },
    success: function(data) {
      var rex = data['response']['groups'][0]['items'];
      var output = '';
      for (var ii = 0; ii < rex.length; ++ii) {
        var reason = '';
        if (url.indexOf('friend') >= 0 && 'friendVisits' in rex[ii]['venue']) {
          visits = rex[ii]['venue']['friendVisits'];
          reason += visits['summary'] + ' (';
          var friends = [];
          for (var jj = 0; jj < visits['items'].length; ++jj) {
            var visit = visits['items'][jj];
            friends.push(userToShortName(visit['user']) + ' x' + visit['visitedCount']);
          }
          reason += friends.join(', ') + ')';
        } else if ('reasons' in rex[ii] && rex[ii]['reasons']['items'].length > 0) {
          reason = rex[ii]['reasons']['items'][0]['message'];
        }
        output += '<div class=venue><b>' + rex[ii]['venue']['name'] + '</b><br>' +
          '<span class=reason>' + reason + '</span></div>';

        var latlng = new google.maps.LatLng(rex[ii]['venue']['location']['lat'],
                                            rex[ii]['venue']['location']['lng']);
        var marker = new google.maps.Marker({
          position: latlng,
          map: map,
        });
        markers.push(marker);
        bounds.extend(latlng);
      }

      document.getElementById('output').innerHTML = output;
      map.fitBounds(bounds);
    }
  });
}

function findVenueAndShowInfo(venueName) {
  var url = 'https://' + apihost + '/v2/venues/search' +
    '?oauth_token=' + token +
    '&v=20130415' +
    '&ll=' + userLL.toString() +
    '&query=' + venueName +
    '&radius=100000';
  debug(url);
  $.ajax({
    url: url,
    dataType: 'json',
    type: 'GET',
    error: function(data) {
      debug('Error: ' + JSON.stringify(data));
    },
    success: function(data) {
      var venues = data['response']['venues'];
      if (venues.length == 0) {
        document.getElementById('output').innerHTML = 'Could not find <b>' + venueName + '</b>';
      } else {
        showVenueInfo(venues[0]['id']);
      }
    }
  });
}

function showVenueInfo(venueId) {
  var url = 'https://' + apihost + '/v2/venues/' + venueId +
    '?oauth_token=' + token +
    '&v=20130415';
  debug(url);
  $.ajax({
    url: url,
    dataType: 'json',
    type: 'GET',
    error: function(data) {
      debug('Error: ' + JSON.stringify(data));
    },
    success: function(data) {
      var venue = data['response']['venue'];
      var output = '<div><b>' + venue['name'] + '</b><br>' + venue['location']['address'] + '<br>';
      var categories = [];
      for (var ii = 0; ii < venue['categories'].length; ++ii) {
        categories.push(venue['categories'][ii]['shortName']);
      }
      output += categories.join(', ') + '<br>';

      if ('photos' in venue && 'groups' in venue['photos'] && venue['photos']['groups'].length > 0) {
        var photos = venue['photos']['groups'][0]['items'];
        for (var ii = 0; ii < photos.length && ii < 3; ++ii) {
          output += '<img class=venueImg src="' + photos[ii]['prefix'] + '200x200' +
            photos[ii]['suffix'] + '">';
        }
      }

      output += '<br>';
      var totalTips = 0;
      for (var group = 0; group < venue['tips']['groups'].length && totalTips < 8; ++group) {
        var tips = venue['tips']['groups'][group]['items'];
        for (var ii = 0; ii < tips.length && totalTips < 8; ++ii) {
          output += '<b>' + tips[ii]['user']['firstName'] + '</b> says: <div class=tip>"' +
            tips[ii]['text'] + '"</div>';
          totalTips++;
        }
      }

      output += '</div>';

      document.getElementById('output').innerHTML = output;

      var latlng = new google.maps.LatLng(venue['location']['lat'],
                                          venue['location']['lng']);
      var marker = new google.maps.Marker({
        position: latlng,
        map: map,
      });
      markers.push(marker);
      map.setCenter(latlng);
      map.setZoom(18);
    }
  });
}

function parseQuery(query) {
  clearOutput();
  debug('Matching: ' + query);
  if (match = query.match(new RegExp('good to eat (?:in|near|around) (.*)', 'i'))) {
    doExploreWithGeo('&section=food', match[1]);
  } else if (match = query.match(new RegExp('(?:hungry|good to eat)', 'i'))) {
    doExplore('&section=food&ll=' + userLL.toString());
  } else if (match = query.match(new RegExp('friend.*?(?:like|go|gone|been).*?(?:in|near|around) (.*) for (.*)', 'i'))) {
    doExploreWithGeo('&query=' + escape(match[2]) + '&friendVisits=visited', match[1])
  } else if (match = query.match(new RegExp('friend.*?(?:like|go|gone|been).*?for (.*) (?:in|near|around) (.*)', 'i'))) {
    doExploreWithGeo('&query=' + escape(match[1]) + '&friendVisits=visited', match[2]);
  } else if (match = query.match(new RegExp('friend.*?(?:like|go|gone|been).*?(?:in|near|around) (.*)', 'i'))) {
    doExploreWithGeo('&friendVisits=visited', match[1])
  } else if (match = query.match(new RegExp('friend.*?(?:like|go|gone|been).*?for (.*)', 'i'))) {
    doExplore('&query=' + escape(match[1]) + '&friendVisits=visited&ll=' + userLL.toString());
  } else if (match = query.match(new RegExp('friend.*?(?:like|go|gone|been)', 'i'))) {
    doExplore('&friendVisits=visited&ll=' + userLL.toString());
  } else if (match = query.match(new RegExp('a (.*?) place (?:that )i haven\'t been (?:in|near|around) (.*)', 'i'))) {
    doExploreWithGeo('&query=' + escape(match[1]) + '&novelty=new', match[2]);
  } else if (match = query.match(new RegExp('i haven\'t been (?:in|near|around) (.*)', 'i'))) {
    doExploreWithGeo('&novelty=new', match[1]);
  } else if (match = query.match(new RegExp('a (.*?) place (?:that )i haven\'t been', 'i'))) {
    doExplore('&query=' + escape(match[1]) + '&novelty=new&ll=' + userLL.toString());
  } else if (match = query.match(new RegExp('i haven\'t been', 'i'))) {
    doExplore('&novelty=new&ll=' + userLL.toString());
  } else if (match = query.match(new RegExp('(?:for|get)(?: some)? (.*)(?: to eat)? (?:in|near|around) (.*)', 'i'))) {
    doExploreWithGeo('&query=' + escape(match[1]), match[2]);
  } else if (match = query.match(new RegExp('(?:about|for|get)(?: some)? (.*)(?: to eat)?', 'i'))) {
    doExplore('&ll=' + userLL.toString() + '&query=' + escape(match[1]));
  } else if (match = query.match(new RegExp('good at (.*)', 'i'))) {
    findVenueAndShowInfo(match[1]);
  } else if (match = query.match(new RegExp('where (?:is|was) (.*)', 'i'))) {
    var name = match[1].toLowerCase();
    if (name == 'dennis') {
      doFindFriend('dens');
    } else {
      doFindFriend(name);
    }
  } else {
    document.getElementById('output').innerHTML = 'Come again?';
  }
}
