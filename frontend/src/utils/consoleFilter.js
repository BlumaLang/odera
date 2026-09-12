var IGNORED = [
  'expo-av','shadow','boxShadow','pointerEvents','Cannot record touch end',
  'React DevTools','Download the React DevTools','Running application',
  'props.pointerEvents','Direct stream failed','Unexpected text node',
  'YouTube Player error','beforeinstallprompt','doubleclick','googleads',
  'AbortError','The user aborted','network request failed',
  'startTime','reportAllChanges','Banner not shown',
  'Failed to load resource','Request timed out','API Error',
  'Maximum update depth','Could not set audio mode','Internal Server Error',
  'fetch failed','SyntaxError','Unexpected token','is not valid JSON',
  'Error fetching feed','lrclib.net','503','Service Unavailable',
  'fetchSongLyrics','Failed to get recently played','Search error',
  'Load more error','Failed to fetch artist','ERR_CONNECTION_REFUSED',
  'net::ERR','localhost:8090','CONNECTION_REFUSED','corsproxy.io',
  '403','Forbidden','pipedapi','invidious','inv.nadeko',
  'pagead','viewthroughconversion','CORS','Access-Control-Allow-Origin',
  'ERR_FAILED','ServiceWorker','sw.js','No directive','Content Security Policy',
  'hqdefault','mqdefault','maxresdefault','i.ytimg.com','404','Not Found',
  'GET.*ytimg','Image','load','ytimg.com','/vi/','thumbnail',
  'www-widgetapi','postMessage','DOMWindow','target origin',
  'Banner not shown','beforeinstallpromptevent',
  'www.youtube.com','doubleclick.net',
  'innertube','followon_view','no_rmkt','foc_id','cv_attributed',
  'pagead/viewthroughconversion','googleads.g.doubleclick.net',
  'Access to fetch','redirected from','has been blocked by CORS policy',
  'No \'Access-Control-Allow-Origin\' header is present',
  'Failed to convert value to \'Response\'',
  'The FetchEvent for',
  'resulted in a network error response',
  'powerPreference',
  'requestAdapter',
  '369219127',
  'Invalid style property',
  'Invalid style property of "outline"',
  'outline',
  'staytup-audio-player',
];
function bad(a){
  try{
    var t=Array.prototype.slice.call(a).map(function(x){
      if (x && (x.target || x.srcElement)) {
        var elem = x.target || x.srcElement;
        return (elem.id || elem.tagName || '') + ' ' + (x.message || '') + ' ' + (x.type || '');
      }
      return typeof x==='string'?x:(x&&typeof x==='object'?(x.message||'')+(x.stack||''):String(x||''));
    }).join(' ');
    return IGNORED.some(function(p){return t.indexOf(p)!==-1;});
  }catch(e){return false;}
}
if(typeof console!=='undefined'){
  var W=console.warn,E=console.error,L=console.log,I=console.info;
  console.warn =function(){if(!bad(arguments))W.apply(console,arguments);};
  console.error=function(){if(!bad(arguments))E.apply(console,arguments);};
  console.log  =function(){if(!bad(arguments))L.apply(console,arguments);};
  console.info =function(){if(!bad(arguments))I.apply(console,arguments);};
  try{
    window.onerror = function(msg, url, line, col, error) {
      try {
        var m = (msg || '') + ' ' + (url || '') + ' ' + (error ? (error.stack || error.message) : '');
        if (m.indexOf('googleads')!==-1||m.indexOf('doubleclick')!==-1||
            m.indexOf('CORS')!==-1||m.indexOf('ERR_FAILED')!==-1||
            m.indexOf('net::ERR')!==-1||m.indexOf('ytimg')!==-1||
            m.indexOf('404')!==-1||m.indexOf('Not Found')!==-1||
            m.indexOf('postMessage')!==-1||m.indexOf('DOMWindow')!==-1||
            m.indexOf('target origin')!==-1||m.indexOf('www-widgetapi')!==-1||
            m.indexOf('www.youtube.com')!==-1||m.indexOf('startTime')!==-1||
            m.indexOf('reportAllChanges')!==-1||m.indexOf('beforeinstallprompt')!==-1){
          return true; // suppresses uncaught exception from DevTools console
        }
      } catch (_) {}
      return false;
    };
    window.addEventListener('error',function(e){
      if (!e || (typeof ErrorEvent !== 'undefined' && e instanceof Event && !(e instanceof ErrorEvent)) || (e.target && e.target !== window && (e.target.nodeType || e.target.tagName))) {
        return;
      }
      var msg=(e&&e.message)||'';
      var src=(e&&e.filename)||'';
      var combined=msg+' '+src;
      if(combined.indexOf('googleads')!==-1||combined.indexOf('doubleclick')!==-1||
         combined.indexOf('CORS')!==-1||combined.indexOf('ERR_FAILED')!==-1||
         combined.indexOf('net::ERR')!==-1||combined.indexOf('ytimg')!==-1||
         combined.indexOf('404')!==-1||combined.indexOf('Not Found')!==-1||
         combined.indexOf('postMessage')!==-1||combined.indexOf('DOMWindow')!==-1||
         combined.indexOf('target origin')!==-1||combined.indexOf('www-widgetapi')!==-1||
         combined.indexOf('www.youtube.com')!==-1||combined.indexOf('startTime')!==-1||
         combined.indexOf('reportAllChanges')!==-1||
         combined.indexOf('beforeinstallprompt')!==-1){
        e.preventDefault();return false;
      }
    },true);
    window.onunhandledrejection = function(e) {
      try {
        var r = e && e.reason;
        var m = r && typeof r === 'object' ? (r.message || String(r)) : String(r || '');
        if (m.indexOf('googleads')!==-1||m.indexOf('doubleclick')!==-1||m.indexOf('CORS')!==-1||
            m.indexOf('ERR_FAILED')!==-1||m.indexOf('fetch')!==-1||m.indexOf('abort')!==-1||
            m.indexOf('404')!==-1||m.indexOf('Not Found')!==-1||m.indexOf('net::ERR')!==-1||
            m.indexOf('www-widgetapi')!==-1||m.indexOf('postMessage')!==-1||
            m.indexOf('target origin')!==-1||m.indexOf('www.youtube.com')!==-1||
            m.indexOf('startTime')!==-1||m.indexOf('reportAllChanges')!==-1){
          if (e.preventDefault) e.preventDefault();
          return true;
        }
      } catch (_) {}
      return false;
    };
    window.addEventListener('unhandledrejection',function(e){
      var r=e&&e.reason;
      var m=r&&typeof r==='object'?(r.message||String(r)):String(r||'');
      if(m.indexOf('googleads')!==-1||m.indexOf('doubleclick')!==-1||m.indexOf('CORS')!==-1||
         m.indexOf('ERR_FAILED')!==-1||m.indexOf('fetch')!==-1||m.indexOf('abort')!==-1||
         m.indexOf('404')!==-1||m.indexOf('Not Found')!==-1||m.indexOf('net::ERR')!==-1||
         m.indexOf('www-widgetapi')!==-1||m.indexOf('postMessage')!==-1||
         m.indexOf('target origin')!==-1||m.indexOf('www.youtube.com')!==-1||
         m.indexOf('startTime')!==-1){
        e.preventDefault();return false;
      }
    },true);
    if (typeof window.requestIdleCallback === 'function') {
      var _origRIC = window.requestIdleCallback;
      window.requestIdleCallback = function(cb, opts) {
        return _origRIC.call(window, function(deadline) {
          try {
            return cb(deadline);
          } catch (err) {
            var s = (err && (err.message || err.stack)) ? (err.message + ' ' + (err.stack || '')) : String(err || '');
            if (s.indexOf('startTime') !== -1 || s.indexOf('reportAllChanges') !== -1) {
              return;
            }
            throw err;
          }
        }, opts);
      };
    }
  }catch(e){}
}

// Block known ad-tracking & analytics fetch requests at the network level
if(typeof window!=='undefined'&&typeof window.fetch==='function'){
  var _origFetch=window.fetch;
  window.fetch=function(url,opts){
    try{
      var s=typeof url==='string'?url:(url&&url.url?url.url:String(url||''));
      if(s.indexOf('googleads')!==-1||s.indexOf('doubleclick')!==-1||
         s.indexOf('pagead')!==-1||s.indexOf('viewthroughconversion')!==-1||
         s.indexOf('innertube')!==-1||s.indexOf('googletagmanager')!==-1||
         s.indexOf('googlesyndication')!==-1){
        return Promise.resolve(new Response('',{status:204,statusText:'Blocked'}));
      }
    }catch(e){}
    return _origFetch.apply(this,arguments);
  };
}

// Block XHR to ad-tracking domains too
if(typeof window!=='undefined'&&typeof window.XMLHttpRequest==='function'){
  var _origOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url){
    try{
      var s=typeof url==='string'?url:String(url||'');
      if(s.indexOf('googleads')!==-1||s.indexOf('doubleclick')!==-1||
         s.indexOf('pagead')!==-1||s.indexOf('viewthroughconversion')!==-1||
         s.indexOf('googletagmanager')!==-1||s.indexOf('googlesyndication')!==-1){
        this._blocked=true;
        return;
      }
    }catch(e){}
    return _origOpen.apply(this,arguments);
  };
  var _origSend=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send=function(){
    if(this._blocked)return;
    return _origSend.apply(this,arguments);
  };
}
