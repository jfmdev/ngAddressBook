webpackJsonp(["main"],{

/***/ "../../../../../lib/FileSaver.js":
/***/ (function(module, exports) {

/* FileSaver.js
 * A saveAs() FileSaver implementation.
 * 2013-01-23
 * 
 * By Eli Grey, http://eligrey.com
 * License: X11/MIT
 *   See LICENSE.md
 */

/*global self */
/*jslint bitwise: true, regexp: true, confusion: true, es5: true, vars: true, white: true,
  plusplus: true */

/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */

var saveAs = saveAs
  || (navigator.msSaveBlob && navigator.msSaveBlob.bind(navigator))
  || (function(view) {
	"use strict";
	var
		  doc = view.document
		  // only get URL when necessary in case BlobBuilder.js hasn't overridden it yet
		, get_URL = function() {
			return view.URL || view.webkitURL || view;
		}
		, URL = view.URL || view.webkitURL || view
		, save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a")
		, can_use_save_link = "download" in save_link
		, click = function(node) {
			var event = doc.createEvent("MouseEvents");
			event.initMouseEvent(
				"click", true, false, view, 0, 0, 0, 0, 0
				, false, false, false, false, 0, null
			);
			node.dispatchEvent(event);
		}
		, webkit_req_fs = view.webkitRequestFileSystem
		, req_fs = view.requestFileSystem || webkit_req_fs || view.mozRequestFileSystem
		, throw_outside = function (ex) {
			(view.setImmediate || view.setTimeout)(function() {
				throw ex;
			}, 0);
		}
		, force_saveable_type = "application/octet-stream"
		, fs_min_size = 0
		, deletion_queue = []
		, process_deletion_queue = function() {
			var i = deletion_queue.length;
			while (i--) {
				var file = deletion_queue[i];
				if (typeof file === "string") { // file is an object URL
					URL.revokeObjectURL(file);
				} else { // file is a File
					file.remove();
				}
			}
			deletion_queue.length = 0; // clear queue
		}
		, dispatch = function(filesaver, event_types, event) {
			event_types = [].concat(event_types);
			var i = event_types.length;
			while (i--) {
				var listener = filesaver["on" + event_types[i]];
				if (typeof listener === "function") {
					try {
						listener.call(filesaver, event || filesaver);
					} catch (ex) {
						throw_outside(ex);
					}
				}
			}
		}
		, FileSaver = function(blob, name) {
			// First try a.download, then web filesystem, then object URLs
			var
				  filesaver = this
				, type = blob.type
				, blob_changed = false
				, object_url
				, target_view
				, get_object_url = function() {
					var object_url = get_URL().createObjectURL(blob);
					deletion_queue.push(object_url);
					return object_url;
				}
				, dispatch_all = function() {
					dispatch(filesaver, "writestart progress write writeend".split(" "));
				}
				// on any filesys errors revert to saving with object URLs
				, fs_error = function() {
					// don't create more object URLs than needed
					if (blob_changed || !object_url) {
						object_url = get_object_url(blob);
					}
					if (target_view) {
						target_view.location.href = object_url;
					}
					filesaver.readyState = filesaver.DONE;
					dispatch_all();
				}
				, abortable = function(func) {
					return function() {
						if (filesaver.readyState !== filesaver.DONE) {
							return func.apply(this, arguments);
						}
					};
				}
				, create_if_not_found = {create: true, exclusive: false}
				, slice
			;
			filesaver.readyState = filesaver.INIT;
			if (!name) {
				name = "download";
			}
			if (can_use_save_link) {
				object_url = get_object_url(blob);
				save_link.href = object_url;
				save_link.download = name;
				click(save_link);
				filesaver.readyState = filesaver.DONE;
				dispatch_all();
				return;
			}
			// Object and web filesystem URLs have a problem saving in Google Chrome when
			// viewed in a tab, so I force save with application/octet-stream
			// http://code.google.com/p/chromium/issues/detail?id=91158
			if (view.chrome && type && type !== force_saveable_type) {
				slice = blob.slice || blob.webkitSlice;
				blob = slice.call(blob, 0, blob.size, force_saveable_type);
				blob_changed = true;
			}
			// Since I can't be sure that the guessed media type will trigger a download
			// in WebKit, I append .download to the filename.
			// https://bugs.webkit.org/show_bug.cgi?id=65440
			if (webkit_req_fs && name !== "download") {
				name += ".download";
			}
			if (type === force_saveable_type || webkit_req_fs) {
				target_view = view;
			} else {
				target_view = view.open();
			}
			if (!req_fs) {
				fs_error();
				return;
			}
			fs_min_size += blob.size;
			req_fs(view.TEMPORARY, fs_min_size, abortable(function(fs) {
				fs.root.getDirectory("saved", create_if_not_found, abortable(function(dir) {
					var save = function() {
						dir.getFile(name, create_if_not_found, abortable(function(file) {
							file.createWriter(abortable(function(writer) {
								writer.onwriteend = function(event) {
									target_view.location.href = file.toURL();
									deletion_queue.push(file);
									filesaver.readyState = filesaver.DONE;
									dispatch(filesaver, "writeend", event);
								};
								writer.onerror = function() {
									var error = writer.error;
									if (error.code !== error.ABORT_ERR) {
										fs_error();
									}
								};
								"writestart progress write abort".split(" ").forEach(function(event) {
									writer["on" + event] = filesaver["on" + event];
								});
								writer.write(blob);
								filesaver.abort = function() {
									writer.abort();
									filesaver.readyState = filesaver.DONE;
								};
								filesaver.readyState = filesaver.WRITING;
							}), fs_error);
						}), fs_error);
					};
					dir.getFile(name, {create: false}, abortable(function(file) {
						// delete file if it already exists
						file.remove();
						save();
					}), abortable(function(ex) {
						if (ex.code === ex.NOT_FOUND_ERR) {
							save();
						} else {
							fs_error();
						}
					}));
				}), fs_error);
			}), fs_error);
		}
		, FS_proto = FileSaver.prototype
		, saveAs = function(blob, name) {
			return new FileSaver(blob, name);
		}
	;
	FS_proto.abort = function() {
		var filesaver = this;
		filesaver.readyState = filesaver.DONE;
		dispatch(filesaver, "abort");
	};
	FS_proto.readyState = FS_proto.INIT = 0;
	FS_proto.WRITING = 1;
	FS_proto.DONE = 2;

	FS_proto.error =
	FS_proto.onwritestart =
	FS_proto.onprogress =
	FS_proto.onwrite =
	FS_proto.onabort =
	FS_proto.onerror =
	FS_proto.onwriteend =
		null;

	view.addEventListener("unload", process_deletion_queue, false);
	return saveAs;
}(self));

module.exports = saveAs;

/***/ }),

/***/ "../../../../../lib/pouchdb-5.3.2.min.js":
/***/ (function(module, exports, __webpack_require__) {

/* WEBPACK VAR INJECTION */(function(global) {var require;var require;// PouchDB 5.3.2
// 
// (c) 2012-2016 Dale Harvey and the PouchDB team
// PouchDB may be freely distributed under the Apache license, version 2.0.
// For all details and documentation:
// http://pouchdb.com
!function(e){if(true)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var t;t="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this,t.PouchDB=e()}}(function(){var e;return function t(e,n,r){function o(a,s){if(!n[a]){if(!e[a]){var u="function"==typeof require&&require;if(!s&&u)return require(a,!0);if(i)return i(a,!0);var c=new Error("Cannot find module '"+a+"'");throw c.code="MODULE_NOT_FOUND",c}var f=n[a]={exports:{}};e[a][0].call(f.exports,function(t){var n=e[a][1][t];return o(n?n:t)},f,f.exports,t,e,n,r)}return n[a].exports}for(var i="function"==typeof require&&require,a=0;a<r.length;a++)o(r[a]);return o}({1:[function(e,t,n){"use strict";function r(e){return function(){var t=arguments.length;if(t){for(var n=[],r=-1;++r<t;)n[r]=arguments[r];return e.call(this,n)}return e.call(this,[])}}t.exports=r},{}],2:[function(e,t,n){function r(){return"WebkitAppearance"in document.documentElement.style||window.console&&(console.firebug||console.exception&&console.table)||navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)&&parseInt(RegExp.$1,10)>=31}function o(){var e=arguments,t=this.useColors;if(e[0]=(t?"%c":"")+this.namespace+(t?" %c":" ")+e[0]+(t?"%c ":" ")+"+"+n.humanize(this.diff),!t)return e;var r="color: "+this.color;e=[e[0],r,"color: inherit"].concat(Array.prototype.slice.call(e,1));var o=0,i=0;return e[0].replace(/%[a-z%]/g,function(e){"%%"!==e&&(o++,"%c"===e&&(i=o))}),e.splice(i,0,r),e}function i(){return"object"==typeof console&&console.log&&Function.prototype.apply.call(console.log,console,arguments)}function a(e){try{null==e?n.storage.removeItem("debug"):n.storage.debug=e}catch(t){}}function s(){var e;try{e=n.storage.debug}catch(t){}return e}function u(){try{return window.localStorage}catch(e){}}n=t.exports=e(3),n.log=i,n.formatArgs=o,n.save=a,n.load=s,n.useColors=r,n.storage="undefined"!=typeof chrome&&"undefined"!=typeof chrome.storage?chrome.storage.local:u(),n.colors=["lightseagreen","forestgreen","goldenrod","dodgerblue","darkorchid","crimson"],n.formatters.j=function(e){return JSON.stringify(e)},n.enable(s())},{3:3}],3:[function(e,t,n){function r(){return n.colors[f++%n.colors.length]}function o(e){function t(){}function o(){var e=o,t=+new Date,i=t-(c||t);e.diff=i,e.prev=c,e.curr=t,c=t,null==e.useColors&&(e.useColors=n.useColors()),null==e.color&&e.useColors&&(e.color=r());var a=Array.prototype.slice.call(arguments);a[0]=n.coerce(a[0]),"string"!=typeof a[0]&&(a=["%o"].concat(a));var s=0;a[0]=a[0].replace(/%([a-z%])/g,function(t,r){if("%%"===t)return t;s++;var o=n.formatters[r];if("function"==typeof o){var i=a[s];t=o.call(e,i),a.splice(s,1),s--}return t}),"function"==typeof n.formatArgs&&(a=n.formatArgs.apply(e,a));var u=o.log||n.log||console.log.bind(console);u.apply(e,a)}t.enabled=!1,o.enabled=!0;var i=n.enabled(e)?o:t;return i.namespace=e,i}function i(e){n.save(e);for(var t=(e||"").split(/[\s,]+/),r=t.length,o=0;r>o;o++)t[o]&&(e=t[o].replace(/\*/g,".*?"),"-"===e[0]?n.skips.push(new RegExp("^"+e.substr(1)+"$")):n.names.push(new RegExp("^"+e+"$")))}function a(){n.enable("")}function s(e){var t,r;for(t=0,r=n.skips.length;r>t;t++)if(n.skips[t].test(e))return!1;for(t=0,r=n.names.length;r>t;t++)if(n.names[t].test(e))return!0;return!1}function u(e){return e instanceof Error?e.stack||e.message:e}n=t.exports=o,n.coerce=u,n.disable=a,n.enable=i,n.enabled=s,n.humanize=e(9),n.names=[],n.skips=[],n.formatters={};var c,f=0},{9:9}],4:[function(e,t,n){function r(){this._events=this._events||{},this._maxListeners=this._maxListeners||void 0}function o(e){return"function"==typeof e}function i(e){return"number"==typeof e}function a(e){return"object"==typeof e&&null!==e}function s(e){return void 0===e}t.exports=r,r.EventEmitter=r,r.prototype._events=void 0,r.prototype._maxListeners=void 0,r.defaultMaxListeners=10,r.prototype.setMaxListeners=function(e){if(!i(e)||0>e||isNaN(e))throw TypeError("n must be a positive number");return this._maxListeners=e,this},r.prototype.emit=function(e){var t,n,r,i,u,c;if(this._events||(this._events={}),"error"===e&&(!this._events.error||a(this._events.error)&&!this._events.error.length)){if(t=arguments[1],t instanceof Error)throw t;throw TypeError('Uncaught, unspecified "error" event.')}if(n=this._events[e],s(n))return!1;if(o(n))switch(arguments.length){case 1:n.call(this);break;case 2:n.call(this,arguments[1]);break;case 3:n.call(this,arguments[1],arguments[2]);break;default:i=Array.prototype.slice.call(arguments,1),n.apply(this,i)}else if(a(n))for(i=Array.prototype.slice.call(arguments,1),c=n.slice(),r=c.length,u=0;r>u;u++)c[u].apply(this,i);return!0},r.prototype.addListener=function(e,t){var n;if(!o(t))throw TypeError("listener must be a function");return this._events||(this._events={}),this._events.newListener&&this.emit("newListener",e,o(t.listener)?t.listener:t),this._events[e]?a(this._events[e])?this._events[e].push(t):this._events[e]=[this._events[e],t]:this._events[e]=t,a(this._events[e])&&!this._events[e].warned&&(n=s(this._maxListeners)?r.defaultMaxListeners:this._maxListeners,n&&n>0&&this._events[e].length>n&&(this._events[e].warned=!0,console.error("(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.",this._events[e].length),"function"==typeof console.trace&&console.trace())),this},r.prototype.on=r.prototype.addListener,r.prototype.once=function(e,t){function n(){this.removeListener(e,n),r||(r=!0,t.apply(this,arguments))}if(!o(t))throw TypeError("listener must be a function");var r=!1;return n.listener=t,this.on(e,n),this},r.prototype.removeListener=function(e,t){var n,r,i,s;if(!o(t))throw TypeError("listener must be a function");if(!this._events||!this._events[e])return this;if(n=this._events[e],i=n.length,r=-1,n===t||o(n.listener)&&n.listener===t)delete this._events[e],this._events.removeListener&&this.emit("removeListener",e,t);else if(a(n)){for(s=i;s-- >0;)if(n[s]===t||n[s].listener&&n[s].listener===t){r=s;break}if(0>r)return this;1===n.length?(n.length=0,delete this._events[e]):n.splice(r,1),this._events.removeListener&&this.emit("removeListener",e,t)}return this},r.prototype.removeAllListeners=function(e){var t,n;if(!this._events)return this;if(!this._events.removeListener)return 0===arguments.length?this._events={}:this._events[e]&&delete this._events[e],this;if(0===arguments.length){for(t in this._events)"removeListener"!==t&&this.removeAllListeners(t);return this.removeAllListeners("removeListener"),this._events={},this}if(n=this._events[e],o(n))this.removeListener(e,n);else if(n)for(;n.length;)this.removeListener(e,n[n.length-1]);return delete this._events[e],this},r.prototype.listeners=function(e){var t;return t=this._events&&this._events[e]?o(this._events[e])?[this._events[e]]:this._events[e].slice():[]},r.prototype.listenerCount=function(e){if(this._events){var t=this._events[e];if(o(t))return 1;if(t)return t.length}return 0},r.listenerCount=function(e,t){return e.listenerCount(t)}},{}],5:[function(e,t,n){(function(e){"use strict";function n(){f=!0;for(var e,t,n=l.length;n;){for(t=l,l=[],e=-1;++e<n;)t[e]();n=l.length}f=!1}function r(e){1!==l.push(e)||f||o()}var o,i=e.MutationObserver||e.WebKitMutationObserver;if(i){var a=0,s=new i(n),u=e.document.createTextNode("");s.observe(u,{characterData:!0}),o=function(){u.data=a=++a%2}}else if(e.setImmediate||"undefined"==typeof e.MessageChannel)o="document"in e&&"onreadystatechange"in e.document.createElement("script")?function(){var t=e.document.createElement("script");t.onreadystatechange=function(){n(),t.onreadystatechange=null,t.parentNode.removeChild(t),t=null},e.document.documentElement.appendChild(t)}:function(){setTimeout(n,0)};else{var c=new e.MessageChannel;c.port1.onmessage=n,o=function(){c.port2.postMessage(0)}}var f,l=[];t.exports=r}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],6:[function(e,t,n){"function"==typeof Object.create?t.exports=function(e,t){e.super_=t,e.prototype=Object.create(t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}})}:t.exports=function(e,t){e.super_=t;var n=function(){};n.prototype=t.prototype,e.prototype=new n,e.prototype.constructor=e}},{}],7:[function(e,t,n){(function(e){e("object"==typeof n?n:this)}).call(this,function(e){var t=Array.prototype.slice,n=Array.prototype.forEach,r=function(e){if("object"!=typeof e)throw e+" is not an object";var o=t.call(arguments,1);return n.call(o,function(t){if(t)for(var n in t)"object"==typeof t[n]&&e[n]?r.call(e,e[n],t[n]):e[n]=t[n]}),e};e.extend=r})},{}],8:[function(e,t,n){"use strict";function r(){}function o(e){if("function"!=typeof e)throw new TypeError("resolver must be a function");this.state=m,this.queue=[],this.outcome=void 0,e!==r&&u(this,e)}function i(e,t,n){this.promise=e,"function"==typeof t&&(this.onFulfilled=t,this.callFulfilled=this.otherCallFulfilled),"function"==typeof n&&(this.onRejected=n,this.callRejected=this.otherCallRejected)}function a(e,t,n){p(function(){var r;try{r=t(n)}catch(o){return v.reject(e,o)}r===e?v.reject(e,new TypeError("Cannot resolve promise with itself")):v.resolve(e,r)})}function s(e){var t=e&&e.then;return e&&"object"==typeof e&&"function"==typeof t?function(){t.apply(e,arguments)}:void 0}function u(e,t){function n(t){i||(i=!0,v.reject(e,t))}function r(t){i||(i=!0,v.resolve(e,t))}function o(){t(r,n)}var i=!1,a=c(o);"error"===a.status&&n(a.value)}function c(e,t){var n={};try{n.value=e(t),n.status="success"}catch(r){n.status="error",n.value=r}return n}function f(e){return e instanceof this?e:v.resolve(new this(r),e)}function l(e){var t=new this(r);return v.reject(t,e)}function d(e){function t(e,t){function r(e){a[t]=e,++s!==o||i||(i=!0,v.resolve(c,a))}n.resolve(e).then(r,function(e){i||(i=!0,v.reject(c,e))})}var n=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var o=e.length,i=!1;if(!o)return this.resolve([]);for(var a=new Array(o),s=0,u=-1,c=new this(r);++u<o;)t(e[u],u);return c}function h(e){function t(e){n.resolve(e).then(function(e){i||(i=!0,v.resolve(s,e))},function(e){i||(i=!0,v.reject(s,e))})}var n=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var o=e.length,i=!1;if(!o)return this.resolve([]);for(var a=-1,s=new this(r);++a<o;)t(e[a]);return s}var p=e(5),v={},y=["REJECTED"],_=["FULFILLED"],m=["PENDING"];t.exports=n=o,o.prototype["catch"]=function(e){return this.then(null,e)},o.prototype.then=function(e,t){if("function"!=typeof e&&this.state===_||"function"!=typeof t&&this.state===y)return this;var n=new this.constructor(r);if(this.state!==m){var o=this.state===_?e:t;a(n,o,this.outcome)}else this.queue.push(new i(n,e,t));return n},i.prototype.callFulfilled=function(e){v.resolve(this.promise,e)},i.prototype.otherCallFulfilled=function(e){a(this.promise,this.onFulfilled,e)},i.prototype.callRejected=function(e){v.reject(this.promise,e)},i.prototype.otherCallRejected=function(e){a(this.promise,this.onRejected,e)},v.resolve=function(e,t){var n=c(s,t);if("error"===n.status)return v.reject(e,n.value);var r=n.value;if(r)u(e,r);else{e.state=_,e.outcome=t;for(var o=-1,i=e.queue.length;++o<i;)e.queue[o].callFulfilled(t)}return e},v.reject=function(e,t){e.state=y,e.outcome=t;for(var n=-1,r=e.queue.length;++n<r;)e.queue[n].callRejected(t);return e},n.resolve=f,n.reject=l,n.all=d,n.race=h},{5:5}],9:[function(e,t,n){function r(e){if(e=""+e,!(e.length>1e4)){var t=/^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(e);if(t){var n=parseFloat(t[1]),r=(t[2]||"ms").toLowerCase();switch(r){case"years":case"year":case"yrs":case"yr":case"y":return n*l;case"days":case"day":case"d":return n*f;case"hours":case"hour":case"hrs":case"hr":case"h":return n*c;case"minutes":case"minute":case"mins":case"min":case"m":return n*u;case"seconds":case"second":case"secs":case"sec":case"s":return n*s;case"milliseconds":case"millisecond":case"msecs":case"msec":case"ms":return n}}}}function o(e){return e>=f?Math.round(e/f)+"d":e>=c?Math.round(e/c)+"h":e>=u?Math.round(e/u)+"m":e>=s?Math.round(e/s)+"s":e+"ms"}function i(e){return a(e,f,"day")||a(e,c,"hour")||a(e,u,"minute")||a(e,s,"second")||e+" ms"}function a(e,t,n){return t>e?void 0:1.5*t>e?Math.floor(e/t)+" "+n:Math.ceil(e/t)+" "+n+"s"}var s=1e3,u=60*s,c=60*u,f=24*c,l=365.25*f;t.exports=function(e,t){return t=t||{},"string"==typeof e?r(e):t["long"]?i(e):o(e)}},{}],10:[function(e,t,n){"use strict";function r(e){if(null!==e)switch(typeof e){case"boolean":return e?1:0;case"number":return f(e);case"string":return e.replace(/\u0002/g,"").replace(/\u0001/g,"").replace(/\u0000/g,"");case"object":var t=Array.isArray(e),r=t?e:Object.keys(e),o=-1,i=r.length,a="";if(t)for(;++o<i;)a+=n.toIndexableString(r[o]);else for(;++o<i;){var s=r[o];a+=n.toIndexableString(s)+n.toIndexableString(e[s])}return a}return""}function o(e,t){var n,r=t,o="1"===e[t];if(o)n=0,t++;else{var i="0"===e[t];t++;var a="",s=e.substring(t,t+d),u=parseInt(s,10)+l;for(i&&(u=-u),t+=d;;){var c=e[t];if("\x00"===c)break;a+=c,t++}a=a.split("."),n=1===a.length?parseInt(a,10):parseFloat(a[0]+"."+a[1]),i&&(n-=10),0!==u&&(n=parseFloat(n+"e"+u))}return{num:n,length:t-r}}function i(e,t){var n=e.pop();if(t.length){var r=t[t.length-1];n===r.element&&(t.pop(),r=t[t.length-1]);var o=r.element,i=r.index;if(Array.isArray(o))o.push(n);else if(i===e.length-2){var a=e.pop();o[a]=n}else e.push(n)}}function a(e,t){for(var r=Math.min(e.length,t.length),o=0;r>o;o++){var i=n.collate(e[o],t[o]);if(0!==i)return i}return e.length===t.length?0:e.length>t.length?1:-1}function s(e,t){return e===t?0:e>t?1:-1}function u(e,t){for(var r=Object.keys(e),o=Object.keys(t),i=Math.min(r.length,o.length),a=0;i>a;a++){var s=n.collate(r[a],o[a]);if(0!==s)return s;if(s=n.collate(e[r[a]],t[o[a]]),0!==s)return s}return r.length===o.length?0:r.length>o.length?1:-1}function c(e){var t=["boolean","number","string","object"],n=t.indexOf(typeof e);return~n?null===e?1:Array.isArray(e)?5:3>n?n+2:n+3:Array.isArray(e)?5:void 0}function f(e){if(0===e)return"1";var t=e.toExponential().split(/e\+?/),n=parseInt(t[1],10),r=0>e,o=r?"0":"2",i=(r?-n:n)-l,a=p.padLeft(i.toString(),"0",d);o+=h+a;var s=Math.abs(parseFloat(t[0]));r&&(s=10-s);var u=s.toFixed(20);return u=u.replace(/\.?0+$/,""),o+=h+u}var l=-324,d=3,h="",p=e(11);n.collate=function(e,t){if(e===t)return 0;e=n.normalizeKey(e),t=n.normalizeKey(t);var r=c(e),o=c(t);if(r-o!==0)return r-o;if(null===e)return 0;switch(typeof e){case"number":return e-t;case"boolean":return e===t?0:t>e?-1:1;case"string":return s(e,t)}return Array.isArray(e)?a(e,t):u(e,t)},n.normalizeKey=function(e){switch(typeof e){case"undefined":return null;case"number":return e===1/0||e===-(1/0)||isNaN(e)?null:e;case"object":var t=e;if(Array.isArray(e)){var r=e.length;e=new Array(r);for(var o=0;r>o;o++)e[o]=n.normalizeKey(t[o])}else{if(e instanceof Date)return e.toJSON();if(null!==e){e={};for(var i in t)if(t.hasOwnProperty(i)){var a=t[i];"undefined"!=typeof a&&(e[i]=n.normalizeKey(a))}}}}return e},n.toIndexableString=function(e){var t="\x00";return e=n.normalizeKey(e),c(e)+h+r(e)+t},n.parseIndexableString=function(e){for(var t=[],n=[],r=0;;){var a=e[r++];if("\x00"!==a)switch(a){case"1":t.push(null);break;case"2":t.push("1"===e[r]),r++;break;case"3":var s=o(e,r);t.push(s.num),r+=s.length;break;case"4":for(var u="";;){var c=e[r];if("\x00"===c)break;u+=c,r++}u=u.replace(/\u0001\u0001/g,"\x00").replace(/\u0001\u0002/g,"").replace(/\u0002\u0002/g,""),t.push(u);break;case"5":var f={element:[],index:t.length};t.push(f.element),n.push(f);break;case"6":var l={element:{},index:t.length};t.push(l.element),n.push(l);break;default:throw new Error("bad collationIndex or unexpectedly reached end of input: "+a)}else{if(1===t.length)return t.pop();i(t,n)}}}},{11:11}],11:[function(e,t,n){"use strict";function r(e,t,n){for(var r="",o=n-e.length;r.length<o;)r+=t;return r}n.padLeft=function(e,t,n){var o=r(e,t,n);return o+e},n.padRight=function(e,t,n){var o=r(e,t,n);return e+o},n.stringLexCompare=function(e,t){var n,r=e.length,o=t.length;for(n=0;r>n;n++){if(n===o)return 1;var i=e.charAt(n),a=t.charAt(n);if(i!==a)return a>i?-1:1}return o>r?-1:0},n.intToDecimalForm=function(e){var t=0>e,n="";do{var r=t?-Math.ceil(e%10):Math.floor(e%10);n=r+n,e=t?Math.ceil(e/10):Math.floor(e/10)}while(e);return t&&"0"!==n&&(n="-"+n),n}},{}],12:[function(e,t,n){"use strict";function r(){this.store={}}function o(e){if(this.store=new r,e&&Array.isArray(e))for(var t=0,n=e.length;n>t;t++)this.add(e[t])}n.Map=r,n.Set=o,r.prototype.mangle=function(e){if("string"!=typeof e)throw new TypeError("key must be a string but Got "+e);return"$"+e},r.prototype.unmangle=function(e){return e.substring(1)},r.prototype.get=function(e){var t=this.mangle(e);return t in this.store?this.store[t]:void 0},r.prototype.set=function(e,t){var n=this.mangle(e);return this.store[n]=t,!0},r.prototype.has=function(e){var t=this.mangle(e);return t in this.store},r.prototype["delete"]=function(e){var t=this.mangle(e);return t in this.store?(delete this.store[t],!0):!1},r.prototype.forEach=function(e){for(var t=Object.keys(this.store),n=0,r=t.length;r>n;n++){var o=t[n],i=this.store[o];o=this.unmangle(o),e(i,o)}},o.prototype.add=function(e){return this.store.set(e,!0)},o.prototype.has=function(e){return this.store.has(e)},o.prototype["delete"]=function(e){return this.store["delete"](e)}},{}],13:[function(e,t,n){function r(){f=!1,s.length?c=s.concat(c):l=-1,c.length&&o()}function o(){if(!f){var e=setTimeout(r);f=!0;for(var t=c.length;t;){for(s=c,c=[];++l<t;)s&&s[l].run();l=-1,t=c.length}s=null,f=!1,clearTimeout(e)}}function i(e,t){this.fun=e,this.array=t}function a(){}var s,u=t.exports={},c=[],f=!1,l=-1;u.nextTick=function(e){var t=new Array(arguments.length-1);if(arguments.length>1)for(var n=1;n<arguments.length;n++)t[n-1]=arguments[n];c.push(new i(e,t)),1!==c.length||f||setTimeout(o,0)},i.prototype.run=function(){this.fun.apply(null,this.array)},u.title="browser",u.browser=!0,u.env={},u.argv=[],u.version="",u.versions={},u.on=a,u.addListener=a,u.once=a,u.off=a,u.removeListener=a,u.removeAllListeners=a,u.emit=a,u.binding=function(e){throw new Error("process.binding is not supported")},u.cwd=function(){return"/"},u.chdir=function(e){throw new Error("process.chdir is not supported")},u.umask=function(){return 0}},{}],14:[function(e,t,n){(function(){var e={}.hasOwnProperty,n=[].slice;t.exports=function(t,r){var o,i,a,s;i=[],s=[];for(o in r)e.call(r,o)&&(a=r[o],"this"!==o&&(i.push(o),s.push(a)));return Function.apply(null,n.call(i).concat([t])).apply(r["this"],s)}}).call(this)},{}],15:[function(t,n,r){!function(t){if("object"==typeof r)n.exports=t();else if("function"==typeof e&&e.amd)e(t);else{var o;try{o=window}catch(i){o=self}o.SparkMD5=t()}}(function(e){"use strict";function t(e,t,n,r,o,i){return t=g(g(t,e),g(r,i)),g(t<<o|t>>>32-o,n)}function n(e,n,r,o,i,a,s){return t(n&r|~n&o,e,n,i,a,s)}function r(e,n,r,o,i,a,s){return t(n&o|r&~o,e,n,i,a,s)}function o(e,n,r,o,i,a,s){return t(n^r^o,e,n,i,a,s)}function i(e,n,r,o,i,a,s){return t(r^(n|~o),e,n,i,a,s)}function a(e,t){var a=e[0],s=e[1],u=e[2],c=e[3];a=n(a,s,u,c,t[0],7,-680876936),c=n(c,a,s,u,t[1],12,-389564586),u=n(u,c,a,s,t[2],17,606105819),s=n(s,u,c,a,t[3],22,-1044525330),a=n(a,s,u,c,t[4],7,-176418897),c=n(c,a,s,u,t[5],12,1200080426),u=n(u,c,a,s,t[6],17,-1473231341),s=n(s,u,c,a,t[7],22,-45705983),a=n(a,s,u,c,t[8],7,1770035416),c=n(c,a,s,u,t[9],12,-1958414417),u=n(u,c,a,s,t[10],17,-42063),s=n(s,u,c,a,t[11],22,-1990404162),a=n(a,s,u,c,t[12],7,1804603682),c=n(c,a,s,u,t[13],12,-40341101),u=n(u,c,a,s,t[14],17,-1502002290),s=n(s,u,c,a,t[15],22,1236535329),a=r(a,s,u,c,t[1],5,-165796510),c=r(c,a,s,u,t[6],9,-1069501632),u=r(u,c,a,s,t[11],14,643717713),s=r(s,u,c,a,t[0],20,-373897302),a=r(a,s,u,c,t[5],5,-701558691),c=r(c,a,s,u,t[10],9,38016083),u=r(u,c,a,s,t[15],14,-660478335),s=r(s,u,c,a,t[4],20,-405537848),a=r(a,s,u,c,t[9],5,568446438),c=r(c,a,s,u,t[14],9,-1019803690),u=r(u,c,a,s,t[3],14,-187363961),s=r(s,u,c,a,t[8],20,1163531501),a=r(a,s,u,c,t[13],5,-1444681467),c=r(c,a,s,u,t[2],9,-51403784),u=r(u,c,a,s,t[7],14,1735328473),s=r(s,u,c,a,t[12],20,-1926607734),a=o(a,s,u,c,t[5],4,-378558),c=o(c,a,s,u,t[8],11,-2022574463),u=o(u,c,a,s,t[11],16,1839030562),s=o(s,u,c,a,t[14],23,-35309556),a=o(a,s,u,c,t[1],4,-1530992060),c=o(c,a,s,u,t[4],11,1272893353),u=o(u,c,a,s,t[7],16,-155497632),s=o(s,u,c,a,t[10],23,-1094730640),a=o(a,s,u,c,t[13],4,681279174),c=o(c,a,s,u,t[0],11,-358537222),u=o(u,c,a,s,t[3],16,-722521979),s=o(s,u,c,a,t[6],23,76029189),a=o(a,s,u,c,t[9],4,-640364487),c=o(c,a,s,u,t[12],11,-421815835),u=o(u,c,a,s,t[15],16,530742520),s=o(s,u,c,a,t[2],23,-995338651),a=i(a,s,u,c,t[0],6,-198630844),c=i(c,a,s,u,t[7],10,1126891415),u=i(u,c,a,s,t[14],15,-1416354905),s=i(s,u,c,a,t[5],21,-57434055),a=i(a,s,u,c,t[12],6,1700485571),c=i(c,a,s,u,t[3],10,-1894986606),u=i(u,c,a,s,t[10],15,-1051523),s=i(s,u,c,a,t[1],21,-2054922799),a=i(a,s,u,c,t[8],6,1873313359),c=i(c,a,s,u,t[15],10,-30611744),u=i(u,c,a,s,t[6],15,-1560198380),s=i(s,u,c,a,t[13],21,1309151649),a=i(a,s,u,c,t[4],6,-145523070),c=i(c,a,s,u,t[11],10,-1120210379),u=i(u,c,a,s,t[2],15,718787259),s=i(s,u,c,a,t[9],21,-343485551),e[0]=g(a,e[0]),e[1]=g(s,e[1]),e[2]=g(u,e[2]),e[3]=g(c,e[3])}function s(e){var t,n=[];for(t=0;64>t;t+=4)n[t>>2]=e.charCodeAt(t)+(e.charCodeAt(t+1)<<8)+(e.charCodeAt(t+2)<<16)+(e.charCodeAt(t+3)<<24);return n}function u(e){var t,n=[];for(t=0;64>t;t+=4)n[t>>2]=e[t]+(e[t+1]<<8)+(e[t+2]<<16)+(e[t+3]<<24);return n}function c(e){var t,n,r,o,i,u,c=e.length,f=[1732584193,-271733879,-1732584194,271733878];for(t=64;c>=t;t+=64)a(f,s(e.substring(t-64,t)));for(e=e.substring(t-64),n=e.length,r=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],t=0;n>t;t+=1)r[t>>2]|=e.charCodeAt(t)<<(t%4<<3);if(r[t>>2]|=128<<(t%4<<3),t>55)for(a(f,r),t=0;16>t;t+=1)r[t]=0;return o=8*c,o=o.toString(16).match(/(.*?)(.{0,8})$/),i=parseInt(o[2],16),u=parseInt(o[1],16)||0,r[14]=i,r[15]=u,a(f,r),f}function f(e){var t,n,r,o,i,s,c=e.length,f=[1732584193,-271733879,-1732584194,271733878];for(t=64;c>=t;t+=64)a(f,u(e.subarray(t-64,t)));for(e=c>t-64?e.subarray(t-64):new Uint8Array(0),n=e.length,r=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],t=0;n>t;t+=1)r[t>>2]|=e[t]<<(t%4<<3);if(r[t>>2]|=128<<(t%4<<3),t>55)for(a(f,r),t=0;16>t;t+=1)r[t]=0;return o=8*c,o=o.toString(16).match(/(.*?)(.{0,8})$/),i=parseInt(o[2],16),s=parseInt(o[1],16)||0,r[14]=i,r[15]=s,a(f,r),f}function l(e){var t,n="";for(t=0;4>t;t+=1)n+=b[e>>8*t+4&15]+b[e>>8*t&15];return n}function d(e){var t;for(t=0;t<e.length;t+=1)e[t]=l(e[t]);return e.join("")}function h(e){return/[\u0080-\uFFFF]/.test(e)&&(e=unescape(encodeURIComponent(e))),e}function p(e,t){var n,r=e.length,o=new ArrayBuffer(r),i=new Uint8Array(o);for(n=0;r>n;n+=1)i[n]=e.charCodeAt(n);return t?i:o}function v(e){return String.fromCharCode.apply(null,new Uint8Array(e))}function y(e,t,n){var r=new Uint8Array(e.byteLength+t.byteLength);return r.set(new Uint8Array(e)),r.set(new Uint8Array(t),e.byteLength),n?r:r.buffer}function _(e){var t,n=[],r=e.length;for(t=0;r-1>t;t+=2)n.push(parseInt(e.substr(t,2),16));return String.fromCharCode.apply(String,n)}function m(){this.reset()}var g=function(e,t){return e+t&4294967295},b=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"];return"5d41402abc4b2a76b9719d911017c592"!==d(c("hello"))&&(g=function(e,t){var n=(65535&e)+(65535&t),r=(e>>16)+(t>>16)+(n>>16);return r<<16|65535&n}),"undefined"==typeof ArrayBuffer||ArrayBuffer.prototype.slice||!function(){function t(e,t){return e=0|e||0,0>e?Math.max(e+t,0):Math.min(e,t)}ArrayBuffer.prototype.slice=function(n,r){var o,i,a,s,u=this.byteLength,c=t(n,u),f=u;return r!==e&&(f=t(r,u)),c>f?new ArrayBuffer(0):(o=f-c,i=new ArrayBuffer(o),a=new Uint8Array(i),s=new Uint8Array(this,c,o),a.set(s),i)}}(),m.prototype.append=function(e){return this.appendBinary(h(e)),this},m.prototype.appendBinary=function(e){this._buff+=e,this._length+=e.length;var t,n=this._buff.length;for(t=64;n>=t;t+=64)a(this._hash,s(this._buff.substring(t-64,t)));return this._buff=this._buff.substring(t-64),this},m.prototype.end=function(e){var t,n,r=this._buff,o=r.length,i=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(t=0;o>t;t+=1)i[t>>2]|=r.charCodeAt(t)<<(t%4<<3);return this._finish(i,o),n=d(this._hash),e&&(n=_(n)),this.reset(),n},m.prototype.reset=function(){return this._buff="",this._length=0,this._hash=[1732584193,-271733879,-1732584194,271733878],this},m.prototype.getState=function(){return{buff:this._buff,length:this._length,hash:this._hash}},m.prototype.setState=function(e){return this._buff=e.buff,this._length=e.length,this._hash=e.hash,this},m.prototype.destroy=function(){delete this._hash,delete this._buff,delete this._length},m.prototype._finish=function(e,t){var n,r,o,i=t;if(e[i>>2]|=128<<(i%4<<3),i>55)for(a(this._hash,e),i=0;16>i;i+=1)e[i]=0;n=8*this._length,n=n.toString(16).match(/(.*?)(.{0,8})$/),r=parseInt(n[2],16),o=parseInt(n[1],16)||0,e[14]=r,e[15]=o,a(this._hash,e)},m.hash=function(e,t){return m.hashBinary(h(e),t)},m.hashBinary=function(e,t){var n=c(e),r=d(n);return t?_(r):r},m.ArrayBuffer=function(){this.reset()},m.ArrayBuffer.prototype.append=function(e){var t,n=y(this._buff.buffer,e,!0),r=n.length;for(this._length+=e.byteLength,t=64;r>=t;t+=64)a(this._hash,u(n.subarray(t-64,t)));return this._buff=r>t-64?new Uint8Array(n.buffer.slice(t-64)):new Uint8Array(0),this},m.ArrayBuffer.prototype.end=function(e){var t,n,r=this._buff,o=r.length,i=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(t=0;o>t;t+=1)i[t>>2]|=r[t]<<(t%4<<3);return this._finish(i,o),n=d(this._hash),e&&(n=_(n)),this.reset(),n},m.ArrayBuffer.prototype.reset=function(){return this._buff=new Uint8Array(0),this._length=0,this._hash=[1732584193,-271733879,-1732584194,271733878],this},m.ArrayBuffer.prototype.getState=function(){var e=m.prototype.getState.call(this);return e.buff=v(e.buff),e},m.ArrayBuffer.prototype.setState=function(e){return e.buff=p(e.buff,!0),m.prototype.setState.call(this,e)},m.ArrayBuffer.prototype.destroy=m.prototype.destroy,m.ArrayBuffer.prototype._finish=m.prototype._finish,m.ArrayBuffer.hash=function(e,t){var n=f(new Uint8Array(e)),r=d(n);return t?_(r):r},m})},{}],16:[function(e,t,n){"use strict";function r(e,t,n){var r=n[n.length-1];e===r.element&&(n.pop(),r=n[n.length-1]);var o=r.element,i=r.index;if(Array.isArray(o))o.push(e);else if(i===t.length-2){var a=t.pop();o[a]=e}else t.push(e)}n.stringify=function(e){var t=[];t.push({obj:e});for(var n,r,o,i,a,s,u,c,f,l,d,h="";n=t.pop();)if(r=n.obj,o=n.prefix||"",i=n.val||"",h+=o,i)h+=i;else if("object"!=typeof r)h+="undefined"==typeof r?null:JSON.stringify(r);else if(null===r)h+="null";else if(Array.isArray(r)){for(t.push({val:"]"}),a=r.length-1;a>=0;a--)s=0===a?"":",",t.push({obj:r[a],prefix:s});t.push({val:"["})}else{u=[];for(c in r)r.hasOwnProperty(c)&&u.push(c);for(t.push({val:"}"}),a=u.length-1;a>=0;a--)f=u[a],l=r[f],d=a>0?",":"",d+=JSON.stringify(f)+":",t.push({obj:l,prefix:d});t.push({val:"{"})}return h},n.parse=function(e){for(var t,n,o,i,a,s,u,c,f,l=[],d=[],h=0;;)if(t=e[h++],"}"!==t&&"]"!==t&&"undefined"!=typeof t)switch(t){case" ":case"	":case"\n":case":":case",":break;case"n":h+=3,r(null,l,d);break;case"t":h+=3,r(!0,l,d);break;case"f":h+=4,r(!1,l,d);break;case"0":case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":case"-":for(n="",h--;;){if(o=e[h++],!/[\d\.\-e\+]/.test(o)){h--;break}n+=o}r(parseFloat(n),l,d);break;case'"':for(i="",a=void 0,s=0;;){if(u=e[h++],'"'===u&&("\\"!==a||s%2!==1))break;i+=u,a=u,"\\"===a?s++:s=0}r(JSON.parse('"'+i+'"'),l,d);break;case"[":c={element:[],index:l.length},l.push(c.element),d.push(c);break;case"{":f={element:{},index:l.length},l.push(f.element),d.push(f);break;default:throw new Error("unexpectedly reached end of input: "+t)}else{if(1===l.length)return l.pop();r(l.pop(),l,d)}}},{}],17:[function(e,t,n){(function(n,r){"use strict";function o(e){return e&&"object"==typeof e&&"default"in e?e["default"]:e}function i(e,t){for(var n={},r=0,o=t.length;o>r;r++){var i=t[r];i in e&&(n[i]=e[i])}return n}function a(e){return e instanceof ArrayBuffer||"undefined"!=typeof Blob&&e instanceof Blob}function s(e){if("function"==typeof e.slice)return e.slice(0);var t=new ArrayBuffer(e.byteLength),n=new Uint8Array(t),r=new Uint8Array(e);return n.set(r),t}function u(e){if(e instanceof ArrayBuffer)return s(e);var t=e.size,n=e.type;return"function"==typeof e.slice?e.slice(0,t,n):e.webkitSlice(0,t,n)}function c(e){var t,n,r;if(!e||"object"!=typeof e)return e;if(Array.isArray(e)){for(t=[],n=0,r=e.length;r>n;n++)t[n]=c(e[n]);return t}if(e instanceof Date)return e.toISOString();if(a(e))return u(e);t={};for(n in e)if(Object.prototype.hasOwnProperty.call(e,n)){var o=c(e[n]);"undefined"!=typeof o&&(t[n]=o)}return t}function f(e){var t=!1;return rr(function(n){if(t)throw new Error("once called more than once");t=!0,e.apply(this,n)})}function l(e){return rr(function(t){t=c(t);var r,o=this,i="function"==typeof t[t.length-1]?t.pop():!1;i&&(r=function(e,t){n.nextTick(function(){i(e,t)})});var a=new fr(function(n,r){var i;try{var a=f(function(e,t){e?r(e):n(t)});t.push(a),i=e.apply(o,t),i&&"function"==typeof i.then&&n(i)}catch(s){r(s)}});return r&&a.then(function(e){r(null,e)},r),a})}function d(e,t){function n(e,t,n){if(lr.enabled){for(var r=[e._db_name,t],o=0;o<n.length-1;o++)r.push(n[o]);lr.apply(null,r);var i=n[n.length-1];n[n.length-1]=function(n,r){var o=[e._db_name,t];o=o.concat(n?["error",n]:["success",r]),lr.apply(null,o),i(n,r)}}}return l(rr(function(r){if(this._closed)return fr.reject(new Error("database is closed"));if(this._destroyed)return fr.reject(new Error("database is destroyed"));var o=this;return n(o,e,r),this.taskqueue.isReady?t.apply(this,r):new fr(function(t,n){o.taskqueue.addTask(function(i){i?n(i):t(o[e].apply(o,r))})})}))}function h(e,t,n){return new fr(function(r,o){e.get(t,function(i,a){if(i){if(404!==i.status)return o(i);a={}}var s=a._rev,u=n(a);return u?(u._id=t,u._rev=s,void r(p(e,u,n))):r({updated:!1,rev:s})})})}function p(e,t,n){return e.put(t).then(function(e){return{updated:!0,rev:e.rev}},function(r){if(409!==r.status)throw r;return h(e,t._id,n)})}function v(e){for(var t,n,r,o,i=e.rev_tree.slice();o=i.pop();){var a=o.ids,s=a[2],u=o.pos;if(s.length)for(var c=0,f=s.length;f>c;c++)i.push({pos:u+1,ids:s[c]});else{var l=!!a[1].deleted,d=a[0];t&&!(r!==l?r:n!==u?u>n:d>t)||(t=d,n=u,r=l)}}return n+"-"+t}function y(e){return e.ids}function _(e,t){t||(t=v(e));for(var n,r=t.substring(t.indexOf("-")+1),o=e.rev_tree.map(y);n=o.pop();){if(n[0]===r)return!!n[1].deleted;o=o.concat(n[2])}}function m(e){return ir("return "+e+";",{})}function g(e){return new Function("doc",["var emitted = false;","var emit = function (a, b) {","  emitted = true;","};","var view = "+e+";","view(doc);","if (emitted) {","  return true;","}"].join("\n"))}function b(e){if(!e)return null;var t=e.split("/");return 2===t.length?t:1===t.length?[e,e]:null}function w(e){var t=b(e);return t?t.join("/"):null}function E(e,t){for(var n,r=e.slice();n=r.pop();)for(var o=n.pos,i=n.ids,a=i[2],s=t(0===a.length,o,i[0],n.ctx,i[1]),u=0,c=a.length;c>u;u++)r.push({pos:o+1,ids:a[u],ctx:s})}function S(e,t){return e.pos-t.pos}function k(e){var t=[];E(e,function(e,n,r,o,i){e&&t.push({rev:n+"-"+r,pos:n,opts:i})}),t.sort(S).reverse();for(var n=0,r=t.length;r>n;n++)delete t[n].pos;return t}function q(e){for(var t=v(e),n=k(e.rev_tree),r=[],o=0,i=n.length;i>o;o++){var a=n[o];a.rev===t||a.opts.deleted||r.push(a.rev)}return r}function x(e){Error.call(this,e.reason),this.status=e.status,this.name=e.error,this.message=e.reason,this.error=!0}function A(e,t,n){function r(t){for(var r in e)"function"!=typeof e[r]&&(this[r]=e[r]);void 0!==n&&(this.name=n),void 0!==t&&(this.reason=t)}return r.prototype=x.prototype,new r(t)}function T(e){var t,n,r,o,i;return n=e.error===!0&&"string"==typeof e.name?e.name:e.error,i=e.reason,
r=Br("name",n,i),e.missing||"missing"===i||"deleted"===i||"not_found"===n?r=pr:"doc_validation"===n?(r=kr,o=i):"bad_request"===n&&r.message!==i&&(r=qr),r||(r=Br("status",e.status,i)||br),t=A(r,i,n),o&&(t.message=o),e.id&&(t.id=e.id),e.status&&(t.status=e.status),e.missing&&(t.missing=e.missing),t}function O(e,t,n){function r(){o.cancel()}or.EventEmitter.call(this);var o=this;this.db=e,t=t?c(t):{};var i=t.complete=f(function(t,n){t?o.emit("error",t):o.emit("complete",n),o.removeAllListeners(),e.removeListener("destroyed",r)});n&&(o.on("complete",function(e){n(null,e)}),o.on("error",n)),e.once("destroyed",r),t.onChange=function(e){t.isCancelled||(o.emit("change",e),o.startSeq&&o.startSeq<=e.seq&&(o.startSeq=!1))};var a=new fr(function(e,n){t.complete=function(t,r){t?n(t):e(r)}});o.once("cancel",function(){e.removeListener("destroyed",r),t.complete(null,{status:"cancelled"})}),this.then=a.then.bind(a),this["catch"]=a["catch"].bind(a),this.then(function(e){i(null,e)},i),e.taskqueue.isReady?o.doChanges(t):e.taskqueue.addTask(function(){o.isCancelled?o.emit("cancel"):o.doChanges(t)})}function j(e,t,n){var r=[{rev:e._rev}];"all_docs"===n.style&&(r=k(t.rev_tree).map(function(e){return{rev:e.rev}}));var o={id:t.id,changes:r,doc:e};return _(t,e._rev)&&(o.deleted=!0),n.conflicts&&(o.doc._conflicts=q(t),o.doc._conflicts.length||delete o.doc._conflicts),o}function C(e,t,n){function r(){var e=[];l.forEach(function(t){t.docs.forEach(function(n){e.push({id:t.id,docs:[n]})})}),n(null,{results:e})}function o(){++f===c&&r()}function a(e,t,n){l[e]={id:t,docs:n},o()}var s=Array.isArray(t)?t:t.docs,u={};s.forEach(function(e){e.id in u?u[e.id].push(e):u[e.id]=[e]});var c=Object.keys(u).length,f=0,l=new Array(c);Object.keys(u).forEach(function(n,r){var o=u[n],s=i(o[0],["atts_since","attachments"]);s.open_revs=o.map(function(e){return e.rev}),s.open_revs=s.open_revs.filter(function(e){return e});var c=function(e){return e};0===s.open_revs.length&&(delete s.open_revs,c=function(e){return[{ok:e}]}),["revs","attachments","binary","ajax"].forEach(function(e){e in t&&(s[e]=t[e])}),e.get(n,s,function(e,t){a(r,n,e?[{error:e}]:c(t))})})}function I(e){return/^_local/.test(e)}function L(e){for(var t,n=[],r=e.slice();t=r.pop();){var o=t.pos,i=t.ids,a=i[0],s=i[1],u=i[2],c=0===u.length,f=t.history?t.history.slice():[];f.push({id:a,opts:s}),c&&n.push({pos:o+1-f.length,ids:f});for(var l=0,d=u.length;d>l;l++)r.push({pos:o+1,ids:u[l],history:f})}return n.reverse()}function R(e){return 0|Math.random()*e}function D(e,t){t=t||Mr.length;var n="",r=-1;if(e){for(;++r<e;)n+=Mr[R(t)];return n}for(;++r<36;)switch(r){case 8:case 13:case 18:case 23:n+="-";break;case 19:n+=Mr[3&R(16)|8];break;default:n+=Mr[R(16)]}return n}function N(e){return e.reduce(function(e,t){return e[t]=!0,e},{})}function B(e){var t;if(e?"string"!=typeof e?t=A(yr):/^_/.test(e)&&!/^_(design|local)/.test(e)&&(t=A(mr)):t=A(_r),t)throw t}function M(e){if(!/^\d+\-./.test(e))return A(Ir);var t=e.indexOf("-"),n=e.substring(0,t),r=e.substring(t+1);return{prefix:parseInt(n,10),id:r}}function F(e,t){for(var n=e.start-e.ids.length+1,r=e.ids,o=[r[0],t,[]],i=1,a=r.length;a>i;i++)o=[r[i],{status:"missing"},[o]];return[{pos:n,ids:o}]}function U(e,t){var n,r,o,i={status:"available"};if(e._deleted&&(i.deleted=!0),t)if(e._id||(e._id=D()),r=D(32,16).toLowerCase(),e._rev){if(o=M(e._rev),o.error)return o;e._rev_tree=[{pos:o.prefix,ids:[o.id,{status:"missing"},[[r,i,[]]]]}],n=o.prefix+1}else e._rev_tree=[{pos:1,ids:[r,i,[]]}],n=1;else if(e._revisions&&(e._rev_tree=F(e._revisions,i),n=e._revisions.start,r=e._revisions.ids[0]),!e._rev_tree){if(o=M(e._rev),o.error)return o;n=o.prefix,r=o.id,e._rev_tree=[{pos:n,ids:[r,i,[]]}]}B(e._id),e._rev=n+"-"+r;var a={metadata:{},data:{}};for(var s in e)if(Object.prototype.hasOwnProperty.call(e,s)){var u="_"===s[0];if(u&&!Fr[s]){var c=A(kr,s);throw c.message=kr.message+": "+s,c}u&&!Ur[s]?a.metadata[s.slice(1)]=e[s]:a.data[s]=e[s]}return a}function P(e,t){return t>e?-1:e>t?1:0}function H(e,t){for(var n=0;n<e.length;n++)if(t(e[n],n)===!0)return e[n]}function K(e){return function(t,n){t||n[0]&&n[0].error?e(t||n[0]):e(null,n.length?n[0]:n)}}function W(e){for(var t=0;t<e.length;t++){var n=e[t];if(n._deleted)delete n._attachments;else if(n._attachments)for(var r=Object.keys(n._attachments),o=0;o<r.length;o++){var a=r[o];n._attachments[a]=i(n._attachments[a],["data","digest","content_type","length","revpos","stub"])}}}function J(e,t){var n=P(e._id,t._id);if(0!==n)return n;var r=e._revisions?e._revisions.start:0,o=t._revisions?t._revisions.start:0;return P(r,o)}function V(e){var t={},n=[];return E(e,function(e,r,o,i){var a=r+"-"+o;return e&&(t[a]=0),void 0!==i&&n.push({from:i,to:a}),a}),n.reverse(),n.forEach(function(e){void 0===t[e.from]?t[e.from]=1+t[e.to]:t[e.from]=Math.min(t[e.from],1+t[e.to])}),t}function G(e,t,n){var r="limit"in t?t.keys.slice(t.skip,t.limit+t.skip):t.skip>0?t.keys.slice(t.skip):t.keys;if(t.descending&&r.reverse(),!r.length)return e._allDocs({limit:0},n);var o={offset:t.skip};return fr.all(r.map(function(n){var r=$n.extend({key:n,deleted:"ok"},t);return["limit","skip","keys"].forEach(function(e){delete r[e]}),new fr(function(t,i){e._allDocs(r,function(e,r){return e?i(e):(o.total_rows=r.total_rows,void t(r.rows[0]||{key:n,error:"not_found"}))})})})).then(function(e){return o.rows=e,o})}function X(e){var t=e._compactionQueue[0],r=t.opts,o=t.callback;e.get("_local/compaction")["catch"](function(){return!1}).then(function(t){t&&t.last_seq&&(r.last_seq=t.last_seq),e._compact(r,function(t,r){t?o(t):o(null,r),n.nextTick(function(){e._compactionQueue.shift(),e._compactionQueue.length&&X(e)})})})}function z(e){return"_"===e.charAt(0)?e+"is not a valid attachment name, attachment names cannot start with '_'":!1}function Q(e,t,n,r){t.seq=t.seq||0;var o={doc_ids:["_design/"+n],limit:1,since:t.seq};e.changes(o).then(function(e){var n=e.results&&e.results.length&&e.results[0].seq;n&&n>t.seq&&(t.seq=n,delete t.promise),r()})["catch"](r)}function $(e,t,n){e._ddocCache=e._ddocCache||{},e._ddocCache[t]=e._ddocCache[t]||{};var r=e._ddocCache[t];Q(e,r,t,function(o){return o?n(o):(r.promise||(r.promise=new fr(function(n,r){e._get("_design/"+t,{},function(e,t){if(e)return r(e);var o={};["views","filters"].forEach(function(e){o[e]=t.doc[e]}),n(o)})})),void r.promise.then(function(e){n(null,e)})["catch"](n))})}function Y(e,t,n,r,o){$(e,t,function(e,t){if(e)return o(e);var i=t[n]&&t[n][r];return i?void o(null,i):o(A(pr))})}function Z(){or.EventEmitter.call(this)}function ee(){this.isReady=!1,this.failed=!1,this.queue=[]}function te(e){e&&r.debug&&console.error(e)}function ne(e,t){function n(){i.emit("destroyed",o)}function r(){e.removeListener("destroyed",n),e.emit("destroyed",e)}var o=t.originalName,i=e.constructor,a=i._destructionListeners;e.once("destroyed",n),a.has(o)||a.set(o,[]),a.get(o).push(r)}function re(e,t,n){if(!(this instanceof re))return new re(e,t,n);var r=this;"function"!=typeof t&&"undefined"!=typeof t||(n=t,t={}),e&&"object"==typeof e&&(t=e,e=void 0),"undefined"==typeof n&&(n=te),e=e||t.name,t=c(t),delete t.name,this.__opts=t;var o=n;r.auto_compaction=t.auto_compaction,r.prefix=re.prefix,Z.call(r),r.taskqueue=new ee;var i=new fr(function(o,i){n=function(e,t){return e?i(e):(delete t.then,void o(t))},t=c(t);var a,s,u=t.name||e;return function(){try{if("string"!=typeof u)throw s=new Error("Missing/invalid DB name"),s.code=400,s;if(a=re.parseAdapter(u,t),t.originalName=u,t.name=a.name,t.prefix&&"http"!==a.adapter&&"https"!==a.adapter&&(t.name=t.prefix+t.name),t.adapter=t.adapter||a.adapter,r._adapter=t.adapter,Zn("pouchdb:adapter")("Picked adapter: "+t.adapter),r._db_name=u,!re.adapters[t.adapter])throw s=new Error("Adapter is missing"),s.code=404,s;if(!re.adapters[t.adapter].valid())throw s=new Error("Invalid Adapter"),s.code=404,s}catch(e){r.taskqueue.fail(e)}}(),s?i(s):(r.adapter=t.adapter,r.replicate={},r.replicate.from=function(e,t,n){return r.constructor.replicate(e,r,t,n)},r.replicate.to=function(e,t,n){return r.constructor.replicate(r,e,t,n)},r.sync=function(e,t,n){return r.constructor.sync(r,e,t,n)},r.replicate.sync=r.sync,void re.adapters[t.adapter].call(r,t,function(e){return e?(r.taskqueue.fail(e),void n(e)):(ne(r,t),r.emit("created",r),re.emit("created",t.originalName),r.taskqueue.ready(r),void n(null,r))}))});i.then(function(e){o(null,e)},o),r.then=i.then.bind(i),r["catch"]=i["catch"].bind(i)}function oe(){return"undefined"!=typeof chrome&&"undefined"!=typeof chrome.storage&&"undefined"!=typeof chrome.storage.local}function ie(){return Pr}function ae(e){Object.keys(or.EventEmitter.prototype).forEach(function(t){"function"==typeof or.EventEmitter.prototype[t]&&(e[t]=Kr[t].bind(Kr))});var t=e._destructionListeners=new nr.Map;e.on("destroyed",function(e){t.has(e)&&(t.get(e).forEach(function(e){e()}),t["delete"](e))})}function se(e,t){e=e||[],t=t||{};try{return new Blob(e,t)}catch(n){if("TypeError"!==n.name)throw n;for(var r="undefined"!=typeof BlobBuilder?BlobBuilder:"undefined"!=typeof MSBlobBuilder?MSBlobBuilder:"undefined"!=typeof MozBlobBuilder?MozBlobBuilder:WebKitBlobBuilder,o=new r,i=0;i<e.length;i+=1)o.append(e[i]);return o.getBlob(t.type)}}function ue(e,t){if("undefined"==typeof FileReader)return t((new FileReaderSync).readAsArrayBuffer(e));var n=new FileReader;n.onloadend=function(e){var n=e.target.result||new ArrayBuffer(0);t(n)},n.readAsArrayBuffer(e)}function ce(){for(var e={},t=new fr(function(t,n){e.resolve=t,e.reject=n}),n=new Array(arguments.length),r=0;r<n.length;r++)n[r]=arguments[r];return e.promise=t,fr.resolve().then(function(){return fetch.apply(null,n)}).then(function(t){e.resolve(t)})["catch"](function(t){e.reject(t)}),e}function fe(e,t){var n,r,o,i=new Headers,a={method:e.method,credentials:"include",headers:i};return e.json&&(i.set("Accept","application/json"),i.set("Content-Type",e.headers["Content-Type"]||"application/json")),e.body&&e.body instanceof Blob?ue(e.body,function(e){a.body=e}):e.body&&e.processData&&"string"!=typeof e.body?a.body=JSON.stringify(e.body):"body"in e?a.body=e.body:a.body=null,Object.keys(e.headers).forEach(function(t){e.headers.hasOwnProperty(t)&&i.set(t,e.headers[t])}),n=ce(e.url,a),e.timeout>0&&(r=setTimeout(function(){n.reject(new Error("Load timeout for resource: "+e.url))},e.timeout)),n.promise.then(function(t){return o={statusCode:t.status},e.timeout>0&&clearTimeout(r),o.statusCode>=200&&o.statusCode<300?e.binary?t.blob():t.text():t.json()}).then(function(e){o.statusCode>=200&&o.statusCode<300?t(null,o,e):t(e,o)})["catch"](function(e){t(e,o)}),{abort:n.reject}}function le(e,t){var n,r,o=!1,i=function(){n.abort()},a=function(){o=!0,n.abort()};n=e.xhr?new e.xhr:new XMLHttpRequest;try{n.open(e.method,e.url)}catch(s){t(s,{statusCode:413})}n.withCredentials="withCredentials"in e?e.withCredentials:!0,"GET"===e.method?delete e.headers["Content-Type"]:e.json&&(e.headers.Accept="application/json",e.headers["Content-Type"]=e.headers["Content-Type"]||"application/json",e.body&&e.processData&&"string"!=typeof e.body&&(e.body=JSON.stringify(e.body))),e.binary&&(n.responseType="arraybuffer"),"body"in e||(e.body=null);for(var u in e.headers)e.headers.hasOwnProperty(u)&&n.setRequestHeader(u,e.headers[u]);return e.timeout>0&&(r=setTimeout(a,e.timeout),n.onprogress=function(){clearTimeout(r),4!==n.readyState&&(r=setTimeout(a,e.timeout))},"undefined"!=typeof n.upload&&(n.upload.onprogress=n.onprogress)),n.onreadystatechange=function(){if(4===n.readyState){var r={statusCode:n.status};if(n.status>=200&&n.status<300){var i;i=e.binary?se([n.response||""],{type:n.getResponseHeader("Content-Type")}):n.responseText,t(null,r,i)}else{var a={};if(o)a=new Error("ETIMEDOUT"),r.statusCode=400;else try{a=JSON.parse(n.response)}catch(s){}t(a,r)}}},e.body&&e.body instanceof Blob?ue(e.body,function(e){n.send(e)}):n.send(e.body),{abort:i}}function de(){try{return new XMLHttpRequest,!0}catch(e){return!1}}function he(e,t){return Wr||e.xhr?le(e,t):fe(e,t)}function pe(){return""}function ve(e,t){function n(t,n,r){if(!e.binary&&e.json&&"string"==typeof t)try{t=JSON.parse(t)}catch(o){return r(o)}Array.isArray(t)&&(t=t.map(function(e){return e.error||e.missing?T(e):e})),e.binary&&Jr(t,n),r(null,t,n)}function r(e,t){var n,r;if(e.code&&e.status){var o=new Error(e.message||e.code);return o.status=e.status,t(o)}if(e.message&&"ETIMEDOUT"===e.message)return t(e);try{n=JSON.parse(e.responseText),r=T(n)}catch(i){r=T(e)}t(r)}e=c(e);var o={method:"GET",headers:{},json:!0,processData:!0,timeout:1e4,cache:!1};return e=$n.extend(o,e),e.json&&(e.binary||(e.headers.Accept="application/json"),e.headers["Content-Type"]=e.headers["Content-Type"]||"application/json"),e.binary&&(e.encoding=null,e.json=!1),e.processData||(e.json=!1),he(e,function(o,i,a){if(o)return o.status=i?i.statusCode:400,r(o,t);var s,u=i.headers&&i.headers["content-type"],c=a||pe();if(!e.binary&&(e.json||!e.processData)&&"object"!=typeof c&&(/json/.test(u)||/^[\s]*\{/.test(c)&&/\}[\s]*$/.test(c)))try{c=JSON.parse(c.toString())}catch(f){}i.statusCode>=200&&i.statusCode<300?n(c,i,t):(s=T(c),s.status=i.statusCode,t(s))})}function ye(e,t){var n=navigator&&navigator.userAgent?navigator.userAgent.toLowerCase():"",r=-1!==n.indexOf("safari")&&-1===n.indexOf("chrome"),o=-1!==n.indexOf("msie"),i=-1!==n.indexOf("edge"),a=r||(o||i)&&"GET"===e.method,s="cache"in e?e.cache:!0,u=/^blob:/.test(e.url);if(!u&&(a||!s)){var c=-1!==e.url.indexOf("?");e.url+=(c?"&":"?")+"_nonce="+Date.now()}return ve(e,t)}function _e(e){for(var t=zr.exec(e),n={},r=14;r--;){var o=Vr[r],i=t[r]||"",a=-1!==["user","password"].indexOf(o);n[o]=a?decodeURIComponent(i):i}return n[Gr]={},n[Vr[12]].replace(Xr,function(e,t,r){t&&(n[Gr][t]=r)}),n}function me(e){for(var t=e.length,n=new ArrayBuffer(t),r=new Uint8Array(n),o=0;t>o;o++)r[o]=e.charCodeAt(o);return n}function ge(e,t){return se([me(e)],{type:t})}function be(e,t,n){try{return!e(t,n)}catch(r){var o="Filter function threw: "+r.toString();return A(qr,o)}}function we(e){var t={},n=e.filter&&"function"==typeof e.filter;return t.query=e.query_params,function(r){r.doc||(r.doc={});var o=n&&be(e.filter,r.doc,t);if("object"==typeof o)return o;if(o)return!1;if(e.include_docs){if(!e.attachments)for(var i in r.doc._attachments)r.doc._attachments.hasOwnProperty(i)&&(r.doc._attachments[i].stub=!0)}else delete r.doc;return!0}}function Ee(e,t){"console"in r&&"info"in console&&console.info("The above "+e+" is totally normal. "+t)}function Se(e,t,n,r,o){return e.get(t)["catch"](function(n){if(404===n.status)return"http"===e.type()&&Ee(404,"PouchDB is just checking if a remote checkpoint exists."),{session_id:r,_id:t,history:[],replicator:no,version:to};throw n}).then(function(i){return o.cancelled?void 0:(i.history=(i.history||[]).filter(function(e){return e.session_id!==r}),i.history.unshift({last_seq:n,session_id:r}),i.history=i.history.slice(0,ro),i.version=to,i.replicator=no,i.session_id=r,i.last_seq=n,e.put(i)["catch"](function(i){if(409===i.status)return Se(e,t,n,r,o);throw i}))})}function ke(e,t,n,r){this.src=e,this.target=t,this.id=n,this.returnValue=r}function qe(e,t){if(e.session_id===t.session_id)return{last_seq:e.last_seq,history:e.history||[]};var n=e.history||[],r=t.history||[];return xe(n,r)}function xe(e,t){var n=e[0],r=e.slice(1),o=t[0],i=t.slice(1);if(!n||0===t.length)return{last_seq:oo,history:[]};var a=n.session_id;if(Ae(a,t))return{last_seq:n.last_seq,history:e};var s=o.session_id;return Ae(s,r)?{last_seq:o.last_seq,history:i}:xe(r,i)}function Ae(e,t){var n=t[0],r=t.slice(1);return e&&0!==t.length?e===n.session_id?!0:Ae(e,r):!1}function Te(e){return"number"==typeof e.status&&4===Math.floor(e.status/100)}function Oe(e,t){e=parseInt(e,10)||0,t=parseInt(t,10),t!==t||e>=t?t=(e||1)<<1:t+=1;var n=Math.random(),r=t-e;return~~(r*n+e)}function je(e){var t=0;return e||(t=2e3),Oe(e,t)}function Ce(e,t,n,r){return e.retry===!1?(t.emit("error",n),void t.removeAllListeners()):("function"!=typeof e.back_off_function&&(e.back_off_function=je),t.emit("requestError",n),"active"!==t.state&&"pending"!==t.state||(t.emit("paused",n),t.state="stopped",t.once("active",function(){e.current_back_off=ao})),e.current_back_off=e.current_back_off||ao,e.current_back_off=e.back_off_function(e.current_back_off),void setTimeout(r,e.current_back_off))}function Ie(e){return $r(e)}function Le(e,t,n,r){(n>0||r<t.byteLength)&&(t=new Uint8Array(t,n,Math.min(r,t.byteLength)-n)),e.append(t)}function Re(e,t,n,r){(n>0||r<t.length)&&(t=t.substring(n,r)),e.appendBinary(t)}function De(e){return Object.keys(e).sort(ar.collate).reduce(function(t,n){return t[n]=e[n],t},{})}function Ne(e,t,n){var r=n.doc_ids?n.doc_ids.sort(ar.collate):"",o=n.filter?n.filter.toString():"",i="",a="";return n.filter&&n.query_params&&(i=JSON.stringify(De(n.query_params))),n.filter&&"_view"===n.filter&&(a=n.view.toString()),fr.all([e.id(),t.id()]).then(function(e){var t=e[0]+e[1]+o+a+i+r;return co(t)}).then(function(e){return e=e.replace(/\//g,".").replace(/\+/g,"_"),"_local/"+e})}function Be(e){return/^1-/.test(e)}function Me(e){var t=[];return Object.keys(e).forEach(function(n){var r=e[n].missing;r.forEach(function(e){t.push({id:n,rev:e})})}),{docs:t,revs:!0,attachments:!0,binary:!0}}function Fe(e,t,n){function r(){var r=Me(t);if(r.docs.length)return e.bulkGet(r).then(function(e){if(n.cancelled)throw new Error("cancelled");e.results.forEach(function(e){e.docs.forEach(function(e){e.ok?u.push(e.ok):void 0!==e.error&&(f=!1)})})})}function o(e){return e._attachments&&Object.keys(e._attachments).length>0}function i(r){return e.allDocs({keys:r,include_docs:!0}).then(function(e){if(n.cancelled)throw new Error("cancelled");e.rows.forEach(function(e){!e.deleted&&e.doc&&Be(e.value.rev)&&!o(e.doc)&&(u.push(e.doc),delete t[e.id])})})}function a(){var e=Object.keys(t).filter(function(e){var n=t[e].missing;return 1===n.length&&Be(n[0])});return e.length>0?i(e):void 0}function s(){return{ok:f,docs:u}}t=c(t);var u=[],f=!0;return fr.resolve().then(a).then(r).then(s)}function Ue(e,t,n,r,o){function i(){return S?fr.resolve():Ne(e,t,n).then(function(n){E=n,S=new ke(e,t,E,r)})}function a(){if(B=[],0!==w.docs.length){var e=w.docs;return t.bulkDocs({docs:e,new_edits:!1}).then(function(t){if(r.cancelled)throw p(),new Error("cancelled");var n=[],i={};t.forEach(function(e){e.error&&(o.doc_write_failures++,n.push(e),i[e.id]=e)}),N=N.concat(n),o.docs_written+=w.docs.length-n.length;var a=n.filter(function(e){return"unauthorized"!==e.name&&"forbidden"!==e.name});if(e.forEach(function(e){var t=i[e._id];t?r.emit("denied",c(t)):B.push(e)}),a.length>0){var s=new Error("bulkDocs error");throw s.other_errors=n,h("target.bulkDocs failed to write docs",s),new Error("bulkWrite partial failure")}},function(t){throw o.doc_write_failures+=e.length,t})}}function s(){if(w.error)throw new Error("There was a problem getting docs.");o.last_seq=O=w.seq;var e=c(o);return B.length&&(e.docs=B,r.emit("change",e)),x=!0,S.writeCheckpoint(w.seq,M).then(function(){if(x=!1,r.cancelled)throw p(),new Error("cancelled");w=void 0,m()})["catch"](function(e){throw x=!1,h("writeCheckpoint completed with error",e),e})}function u(){var e={};return w.changes.forEach(function(t){"_user/"!==t.id&&(e[t.id]=t.changes.map(function(e){return e.rev}))}),t.revsDiff(e).then(function(e){if(r.cancelled)throw p(),new Error("cancelled");w.diffs=e})}function f(){return Fe(e,w.diffs,r).then(function(e){w.error=!e.ok,e.docs.forEach(function(e){delete w.diffs[e._id],o.docs_read++,w.docs.push(e)})})}function l(){if(!r.cancelled&&!w){if(0===k.length)return void d(!0);w=k.shift(),u().then(f).then(a).then(s).then(l)["catch"](function(e){h("batch processing terminated with error",e)})}}function d(e){return 0===q.changes.length?void(0!==k.length||w||((j&&F.live||A)&&(r.state="pending",r.emit("paused")),A&&p())):void((e||A||q.changes.length>=C)&&(k.push(q),q={seq:0,changes:[],docs:[]},"pending"!==r.state&&"stopped"!==r.state||(r.state="active",r.emit("active")),l()))}function h(e,t){T||(t.message||(t.message=e),o.ok=!1,o.status="aborting",o.errors.push(t),N=N.concat(t),k=[],q={seq:0,changes:[],docs:[]},p())}function p(){if(!(T||r.cancelled&&(o.status="cancelled",x))){o.status=o.status||"complete",o.end_time=new Date,o.last_seq=O,T=!0;var i=N.filter(function(e){return"unauthorized"!==e.name&&"forbidden"!==e.name});if(i.length>0){var a=N.pop();N.length>0&&(a.other_errors=N),a.result=o,Ce(n,r,a,function(){Ue(e,t,n,r)})}else o.errors=N,r.emit("complete",o),r.removeAllListeners()}}function v(e){if(r.cancelled)return p();var t=we(n)(e);t&&(q.seq=e.seq,q.changes.push(e),d(F.live))}function y(e){return L=!1,r.cancelled?p():(e.results.length>0?(F.since=e.last_seq,m()):j?(F.live=!0,m()):A=!0,void d(!0))}function _(e){return L=!1,r.cancelled?p():void h("changes rejected",e)}function m(){function t(){i.cancel()}function o(){r.removeListener("cancel",t)}if(!L&&!A&&k.length<I){L=!0,r._changes&&(r.removeListener("cancel",r._abortChanges),r._changes.cancel()),r.once("cancel",t);var i=e.changes(F).on("change",v);i.then(o,o),i.then(y)["catch"](_),n.retry&&(r._changes=i,r._abortChanges=t)}}function g(){i().then(function(){return r.cancelled?void p():S.getCheckpoint().then(function(e){O=e,F={since:O,limit:C,batch_size:C,style:"all_docs",doc_ids:R,return_docs:!0},n.filter&&("string"!=typeof n.filter?F.include_docs=!0:F.filter=n.filter),"heartbeat"in n&&(F.heartbeat=n.heartbeat),"timeout"in n&&(F.timeout=n.timeout),n.query_params&&(F.query_params=n.query_params),n.view&&(F.view=n.view),m()})})["catch"](function(e){h("getCheckpoint rejected with ",e)})}function b(e){throw x=!1,h("writeCheckpoint completed with error",e),e}var w,E,S,k=[],q={seq:0,changes:[],docs:[]},x=!1,A=!1,T=!1,O=0,j=n.continuous||n.live||!1,C=n.batch_size||100,I=n.batches_limit||10,L=!1,R=n.doc_ids,N=[],B=[],M=D();o=o||{ok:!0,start_time:new Date,docs_read:0,docs_written:0,doc_write_failures:0,errors:[]};var F={};return r.ready(e,t),r.cancelled?void p():(r._addedListeners||(r.once("cancel",p),"function"==typeof n.complete&&(r.once("error",n.complete),r.once("complete",function(e){n.complete(null,e)})),r._addedListeners=!0),void("undefined"==typeof n.since?g():i().then(function(){return x=!0,S.writeCheckpoint(n.since,M)}).then(function(){return x=!1,r.cancelled?void p():(O=n.since,void g())})["catch"](b)))}function Pe(){or.EventEmitter.call(this),this.cancelled=!1,this.state="pending";var e=this,t=new fr(function(t,n){e.once("complete",t),e.once("error",n)});e.then=function(e,n){return t.then(e,n)},e["catch"]=function(e){return t["catch"](e)},e["catch"](function(){})}function He(e,t){var n=t.PouchConstructor;return"string"==typeof e?new n(e,t):e}function Ke(e,t,n,r){if("function"==typeof n&&(r=n,n={}),"undefined"==typeof n&&(n={}),n.doc_ids&&!Array.isArray(n.doc_ids))throw A(qr,"`doc_ids` filter parameter is not a list.");n.complete=r,n=c(n),n.continuous=n.continuous||n.live,n.retry="retry"in n?n.retry:!1,n.PouchConstructor=n.PouchConstructor||this;var o=new Pe(n),i=He(e,n),a=He(t,n);return Ue(i,a,n,o),o}function We(e,t,n,r){return"function"==typeof n&&(r=n,n={}),"undefined"==typeof n&&(n={}),n=c(n),n.PouchConstructor=n.PouchConstructor||this,e=fo.toPouch(e,n),t=fo.toPouch(t,n),new Je(e,t,n,r)}function Je(e,t,n,r){function o(e){h.emit("change",{direction:"pull",change:e})}function i(e){h.emit("change",{direction:"push",change:e})}function a(e){h.emit("denied",{direction:"push",doc:e})}function s(e){h.emit("denied",{direction:"pull",doc:e})}function u(){h.pushPaused=!0,h.pullPaused&&h.emit("paused")}function c(){h.pullPaused=!0,h.pushPaused&&h.emit("paused")}function f(){h.pushPaused=!1,h.pullPaused&&h.emit("active",{direction:"push"})}function l(){h.pullPaused=!1,h.pushPaused&&h.emit("active",{direction:"pull"})}function d(e){return function(t,n){var r="change"===t&&(n===o||n===i),d="denied"===t&&(n===s||n===a),p="paused"===t&&(n===c||n===u),v="active"===t&&(n===l||n===f);(r||d||p||v)&&(t in y||(y[t]={}),y[t][e]=!0,2===Object.keys(y[t]).length&&h.removeAllListeners(t))}}var h=this;this.canceled=!1;var p=n.push?$n.extend({},n,n.push):n,v=n.pull?$n.extend({},n,n.pull):n;this.push=lo(e,t,p),this.pull=lo(t,e,v),this.pushPaused=!0,this.pullPaused=!0;var y={};n.live&&(this.push.on("complete",h.pull.cancel.bind(h.pull)),this.pull.on("complete",h.push.cancel.bind(h.push))),this.on("newListener",function(e){"change"===e?(h.pull.on("change",o),h.push.on("change",i)):"denied"===e?(h.pull.on("denied",s),h.push.on("denied",a)):"active"===e?(h.pull.on("active",l),h.push.on("active",f)):"paused"===e&&(h.pull.on("paused",c),h.push.on("paused",u))}),this.on("removeListener",function(e){"change"===e?(h.pull.removeListener("change",o),h.push.removeListener("change",i)):"denied"===e?(h.pull.removeListener("denied",s),h.push.removeListener("denied",a)):"active"===e?(h.pull.removeListener("active",l),h.push.removeListener("active",f)):"paused"===e&&(h.pull.removeListener("paused",c),h.push.removeListener("paused",u))}),this.pull.on("removeListener",d("pull")),this.push.on("removeListener",d("push"));var _=fr.all([this.push,this.pull]).then(function(e){var t={push:e[0],pull:e[1]};return h.emit("complete",t),r&&r(null,t),h.removeAllListeners(),t},function(e){if(h.cancel(),r?r(e):h.emit("error",e),h.removeAllListeners(),r)throw e});this.then=function(e,t){return _.then(e,t)},this["catch"]=function(e){return _["catch"](e)}}function Ve(e,t){return ge(Qr(e),t)}function Ge(e){for(var t="",n=new Uint8Array(e),r=n.byteLength,o=0;r>o;o++)t+=String.fromCharCode(n[o]);return t}function Xe(e,t){if("undefined"==typeof FileReader)return t(Ge((new FileReaderSync).readAsArrayBuffer(e)));var n=new FileReader,r="function"==typeof n.readAsBinaryString;n.onloadend=function(e){var n=e.target.result||"";return r?t(n):void t(Ge(n))},r?n.readAsBinaryString(e):n.readAsArrayBuffer(e)}function ze(e){return new fr(function(t){Xe(e,function(e){t($r(e))})})}function Qe(e){for(var t=[],n=0,r=e.length;r>n;n++)t=t.concat(e[n]);return t}function $e(e){var t=e.doc&&e.doc._attachments;t&&Object.keys(t).forEach(function(e){var n=t[e];n.data=Ve(n.data,n.content_type)})}function Ye(e){return/^_design/.test(e)?"_design/"+encodeURIComponent(e.slice(8)):/^_local/.test(e)?"_local/"+encodeURIComponent(e.slice(7)):encodeURIComponent(e)}function Ze(e){return e._attachments&&Object.keys(e._attachments)?fr.all(Object.keys(e._attachments).map(function(t){var n=e._attachments[t];return n.data&&"string"!=typeof n.data?ze(n.data).then(function(e){n.data=e}):void 0})):fr.resolve()}function et(e){var t=_e(e);(t.user||t.password)&&(t.auth={username:t.user,password:t.password});var n=t.path.replace(/(^\/|\/$)/g,"").split("/");return t.db=n.pop(),-1===t.db.indexOf("%")&&(t.db=encodeURIComponent(t.db)),t.path=n.join("/"),t}function tt(e,t){return nt(e,e.db+"/"+t)}function nt(e,t){var n=e.path?"/":"";return e.protocol+"://"+e.host+(e.port?":"+e.port:"")+"/"+e.path+n+t}function rt(e){return"?"+Object.keys(e).map(function(t){return t+"="+encodeURIComponent(e[t])}).join("&")}function ot(e,t){function n(e,t,n){var r=e.ajax||{},o=$n.extend(c(p),r,t);return _o(o.method+" "+o.url),Zr.ajax(o,n)}function r(e,t){return new fr(function(r,o){n(e,t,function(e,t){return e?o(e):void r(t)})})}function o(e,t){return d(e,rr(function(e){a().then(function(){return t.apply(this,e)})["catch"](function(t){var n=e.pop();n(t)})}))}function a(){if(e.skipSetup||e.skip_setup)return fr.resolve();if(m)return m;var t={method:"GET",url:h};return m=r({},t)["catch"](function(e){return e&&e.status&&404===e.status?(Ee(404,"PouchDB is just detecting if the remote exists."),r({},{method:"PUT",url:h})):fr.reject(e)})["catch"](function(e){return e&&e.status&&412===e.status?!0:fr.reject(e)}),m["catch"](function(){m=null}),m}function s(e){return e.split("/").map(encodeURIComponent).join("/")}var u=this,f=et;e.getHost&&(f=e.getHost);var l=f(e.name,e),h=tt(l,"");e=c(e);var p=e.ajax||{};if(u.getUrl=function(){return h},u.getHeaders=function(){return p.headers||{}},e.auth||l.auth){var v=e.auth||l.auth,y=v.username+":"+v.password,_=$r(unescape(encodeURIComponent(y)));p.headers=p.headers||{},p.headers.Authorization="Basic "+_}var m;setTimeout(function(){t(null,u)}),u.type=function(){return"http"},u.id=o("id",function(e){n({},{method:"GET",url:nt(l,"")},function(t,n){var r=n&&n.uuid?n.uuid+l.db:tt(l,"");e(null,r)})}),u.request=o("request",function(e,t){e.url=tt(l,e.url),n({},e,t)}),u.compact=o("compact",function(e,t){"function"==typeof e&&(t=e,e={}),e=c(e),n(e,{url:tt(l,"_compact"),method:"POST"},function(){function n(){u.info(function(r,o){o&&!o.compact_running?t(null,{ok:!0}):setTimeout(n,e.interval||200)})}n()})}),u.bulkGet=d("bulkGet",function(e,t){function r(t){var r={};e.revs&&(r.revs=!0),e.attachments&&(r.attachments=!0),n({},{url:tt(l,"_bulk_get"+rt(r)),method:"POST",body:{docs:e.docs}},t)}function o(){function n(e){return function(n,r){u[e]=r.results,++s===o&&t(null,{results:Qe(u)})}}for(var r=po,o=Math.ceil(e.docs.length/r),s=0,u=new Array(o),c=0;o>c;c++){var f=i(e,["revs","attachments"]);f.ajax=p,f.docs=e.docs.slice(c*r,Math.min(e.docs.length,(c+1)*r)),C(a,f,n(c))}}var a=this,s=nt(l,""),u=vo[s];"boolean"!=typeof u?r(function(e,n){if(e){var r=Math.floor(e.status/100);4===r||5===r?(vo[s]=!1,Ee(e.status,"PouchDB is just detecting if the remote supports the _bulk_get API."),o()):t(e)}else vo[s]=!0,t(null,n)}):u?r(t):o()}),u._info=function(e){a().then(function(){n({},{method:"GET",url:tt(l,"")},function(t,n){return t?e(t):(n.host=tt(l,""),void e(null,n))})})["catch"](e)},u.get=o("get",function(e,t,n){function o(e){var n=e._attachments,o=n&&Object.keys(n);return n&&o.length?fr.all(o.map(function(o){var i=n[o],a=Ye(e._id)+"/"+s(o)+"?rev="+e._rev;return r(t,{method:"GET",url:tt(l,a),binary:!0}).then(function(e){return t.binary?e:ze(e)}).then(function(e){delete i.stub,delete i.length,i.data=e})})):void 0}function i(e){return Array.isArray(e)?fr.all(e.map(function(e){return e.ok?o(e.ok):void 0})):o(e)}"function"==typeof t&&(n=t,t={}),t=c(t);var a={};t.revs&&(a.revs=!0),t.revs_info&&(a.revs_info=!0),t.open_revs&&("all"!==t.open_revs&&(t.open_revs=JSON.stringify(t.open_revs)),a.open_revs=t.open_revs),t.rev&&(a.rev=t.rev),t.conflicts&&(a.conflicts=t.conflicts),e=Ye(e);var u={method:"GET",url:tt(l,e+rt(a))};r(t,u).then(function(e){return fr.resolve().then(function(){return t.attachments?i(e):void 0}).then(function(){n(null,e)})})["catch"](n)}),u.remove=o("remove",function(e,t,r,o){var i;"string"==typeof t?(i={_id:e,_rev:t},"function"==typeof r&&(o=r,r={})):(i=e,"function"==typeof t?(o=t,r={}):(o=r,r=t));var a=i._rev||r.rev;n(r,{method:"DELETE",url:tt(l,Ye(i._id))+"?rev="+a},o)}),u.getAttachment=o("getAttachment",function(e,t,r,o){"function"==typeof r&&(o=r,r={});var i=r.rev?"?rev="+r.rev:"",a=tt(l,Ye(e))+"/"+s(t)+i;n(r,{method:"GET",url:a,binary:!0},o)}),u.removeAttachment=o("removeAttachment",function(e,t,r,o){var i=tt(l,Ye(e)+"/"+s(t))+"?rev="+r;n({},{method:"DELETE",url:i},o)}),u.putAttachment=o("putAttachment",function(e,t,r,o,i,a){"function"==typeof i&&(a=i,i=o,o=r,r=null);var u=Ye(e)+"/"+s(t),c=tt(l,u);if(r&&(c+="?rev="+r),"string"==typeof o){var f;try{f=Qr(o)}catch(d){return a(A(wr,"Attachment is not a valid base64 string"))}o=f?ge(f,i):""}var h={headers:{"Content-Type":i},method:"PUT",url:c,processData:!1,body:o,timeout:p.timeout||6e4};n({},h,a)}),u._bulkDocs=function(e,t,r){e.new_edits=t.new_edits,a().then(function(){return fr.all(e.docs.map(Ze))}).then(function(){n(t,{method:"POST",url:tt(l,"_bulk_docs"),body:e},function(e,t){return e?r(e):(t.forEach(function(e){e.ok=!0}),void r(null,t))})})["catch"](r)},u.allDocs=o("allDocs",function(e,t){"function"==typeof e&&(t=e,e={}),e=c(e);var n,o={},i="GET";e.conflicts&&(o.conflicts=!0),e.descending&&(o.descending=!0),e.include_docs&&(o.include_docs=!0),e.attachments&&(o.attachments=!0),e.key&&(o.key=JSON.stringify(e.key)),e.start_key&&(e.startkey=e.start_key),e.startkey&&(o.startkey=JSON.stringify(e.startkey)),e.end_key&&(e.endkey=e.end_key),e.endkey&&(o.endkey=JSON.stringify(e.endkey)),"undefined"!=typeof e.inclusive_end&&(o.inclusive_end=!!e.inclusive_end),
"undefined"!=typeof e.limit&&(o.limit=e.limit),"undefined"!=typeof e.skip&&(o.skip=e.skip);var a=rt(o);if("undefined"!=typeof e.keys){var s="keys="+encodeURIComponent(JSON.stringify(e.keys));s.length+a.length+1<=yo?a+="&"+s:(i="POST",n={keys:e.keys})}r(e,{method:i,url:tt(l,"_all_docs"+a),body:n}).then(function(n){e.include_docs&&e.attachments&&e.binary&&n.rows.forEach($e),t(null,n)})["catch"](t)}),u._changes=function(e){var t="batch_size"in e?e.batch_size:ho;e=c(e),e.timeout="timeout"in e?e.timeout:"timeout"in p?p.timeout:3e4;var r,o=e.timeout?{timeout:e.timeout-5e3}:{},i="undefined"!=typeof e.limit?e.limit:!1;r="return_docs"in e?e.return_docs:"returnDocs"in e?e.returnDocs:!0;var s=i;if(e.style&&(o.style=e.style),(e.include_docs||e.filter&&"function"==typeof e.filter)&&(o.include_docs=!0),e.attachments&&(o.attachments=!0),e.continuous&&(o.feed="longpoll"),e.conflicts&&(o.conflicts=!0),e.descending&&(o.descending=!0),"heartbeat"in e?e.heartbeat&&(o.heartbeat=e.heartbeat):o.heartbeat=1e4,e.filter&&"string"==typeof e.filter&&(o.filter=e.filter,"_view"===e.filter&&e.view&&"string"==typeof e.view&&(o.view=e.view)),e.query_params&&"object"==typeof e.query_params)for(var u in e.query_params)e.query_params.hasOwnProperty(u)&&(o[u]=e.query_params[u]);var f,d="GET";if(e.doc_ids){o.filter="_doc_ids";var h=JSON.stringify(e.doc_ids);h.length<yo?o.doc_ids=h:(d="POST",f={doc_ids:e.doc_ids})}var v,y,_=function(r,u){if(!e.aborted){o.since=r,"object"==typeof o.since&&(o.since=JSON.stringify(o.since)),e.descending?i&&(o.limit=s):o.limit=!i||s>t?t:s;var c={method:d,url:tt(l,"_changes"+rt(o)),timeout:e.timeout,body:f};y=r,e.aborted||a().then(function(){v=n(e,c,u)})["catch"](u)}},m={results:[]},g=function(n,o){if(!e.aborted){var a=0;if(o&&o.results){a=o.results.length,m.last_seq=o.last_seq;var u={};u.query=e.query_params,o.results=o.results.filter(function(t){s--;var n=we(e)(t);return n&&(e.include_docs&&e.attachments&&e.binary&&$e(t),r&&m.results.push(t),e.onChange(t)),n})}else if(n)return e.aborted=!0,void e.complete(n);o&&o.last_seq&&(y=o.last_seq);var c=i&&0>=s||o&&t>a||e.descending;(!e.continuous||i&&0>=s)&&c?e.complete(null,m):setTimeout(function(){_(y,g)},0)}};return _(e.since||0,g),{cancel:function(){e.aborted=!0,v&&v.abort()}}},u.revsDiff=o("revsDiff",function(e,t,r){"function"==typeof t&&(r=t,t={}),n(t,{method:"POST",url:tt(l,"_revs_diff"),body:e},r)}),u._close=function(e){e()},u._destroy=function(t,r){n(t,{url:tt(l,""),method:"DELETE"},function(t,n){return t&&t.status&&404!==t.status?r(t):(u.emit("destroyed"),u.constructor.emit("destroyed",e.name),void r(null,n))})}}function it(){this.promise=new fr(function(e){e()})}function at(e){return ur.hash(e)}function st(e){var t=e.db,n=e.viewName,r=e.map,o=e.reduce,i=e.temporary,a=r.toString()+(o&&o.toString())+"undefined";if(!i&&t._cachedViews){var s=t._cachedViews[a];if(s)return fr.resolve(s)}return t.info().then(function(e){function s(e){e.views=e.views||{};var t=n;-1===t.indexOf("/")&&(t=n+"/"+n);var r=e.views[t]=e.views[t]||{};if(!r[u])return r[u]=!0,e}var u=e.db_name+"-mrview-"+(i?"temp":at(a));return h(t,"_local/mrviews",s).then(function(){return t.registerDependentDatabase(u).then(function(e){var n=e.db;n.auto_compaction=!0;var s={name:u,db:n,sourceDB:t,adapter:t.adapter,mapFun:r,reduceFun:o};return s.db.get("_local/lastSeq")["catch"](function(e){if(404!==e.status)throw e}).then(function(e){return s.seq=e?e.seq:0,i||(t._cachedViews=t._cachedViews||{},t._cachedViews[a]=s,s.db.once("destroyed",function(){delete t._cachedViews[a]})),s})})})})}function ut(e,t,n,r,o,i){return ir("return ("+e.replace(/;\s*$/,"")+");",{emit:t,sum:n,log:r,isArray:o,toJSON:i})}function ct(e){return-1===e.indexOf("/")?[e,e]:e.split("/")}function ft(e){return 1===e.length&&/^1-/.test(e[0].rev)}function lt(e,t){try{e.emit("error",t)}catch(n){console.error("The user's map/reduce function threw an uncaught error.\nYou can debug this error by doing:\nmyDatabase.on('error', function (err) { debugger; });\nPlease double-check your map/reduce function."),console.error(t)}}function dt(e,t,n){try{return{output:t.apply(null,n)}}catch(r){return lt(e,r),{error:r}}}function ht(e,t){var n=qo(e.key,t.key);return 0!==n?n:qo(e.value,t.value)}function pt(e,t,n){return n=n||0,"number"==typeof t?e.slice(n,t+n):n>0?e.slice(n):e}function vt(e){var t=e.value,n=t&&"object"==typeof t&&t._id||e.id;return n}function yt(e){e.rows.forEach(function(e){var t=e.doc&&e.doc._attachments;t&&Object.keys(t).forEach(function(e){var n=t[e];t[e].data=Ve(n.data,n.content_type)})})}function _t(e){return function(t){return e.include_docs&&e.attachments&&e.binary&&yt(t),t}}function mt(e){var t="builtin "+e+" function requires map values to be numbers or number arrays";return new Pt(t)}function gt(e){for(var t=0,n=0,r=e.length;r>n;n++){var o=e[n];if("number"!=typeof o){if(!Array.isArray(o))throw mt("_sum");t="number"==typeof t?[t]:t;for(var i=0,a=o.length;a>i;i++){var s=o[i];if("number"!=typeof s)throw mt("_sum");"undefined"==typeof t[i]?t.push(s):t[i]+=s}}else"number"==typeof t?t+=o:t[0]+=o}return t}function bt(e,t,n,r){var o=t[e];"undefined"!=typeof o&&(r&&(o=encodeURIComponent(JSON.stringify(o))),n.push(e+"="+o))}function wt(e){if("undefined"!=typeof e){var t=Number(e);return isNaN(t)||t!==parseInt(e,10)?e:t}}function Et(e){return e.group_level=wt(e.group_level),e.limit=wt(e.limit),e.skip=wt(e.skip),e}function St(e){if(e){if("number"!=typeof e)return new Ut('Invalid value for integer: "'+e+'"');if(0>e)return new Ut('Invalid value for positive integer: "'+e+'"')}}function kt(e,t){var n=e.descending?"endkey":"startkey",r=e.descending?"startkey":"endkey";if("undefined"!=typeof e[n]&&"undefined"!=typeof e[r]&&qo(e[n],e[r])>0)throw new Ut("No rows can match your key range, reverse your start_key and end_key or set {descending : true}");if(t.reduce&&e.reduce!==!1){if(e.include_docs)throw new Ut("{include_docs:true} is invalid for reduce");if(e.keys&&e.keys.length>1&&!e.group&&!e.group_level)throw new Ut("Multi-key fetches for reduce views must use {group: true}")}["group_level","limit","skip"].forEach(function(t){var n=St(e[t]);if(n)throw n})}function qt(e,t,n){var r,o=[],i="GET";if(bt("reduce",n,o),bt("include_docs",n,o),bt("attachments",n,o),bt("limit",n,o),bt("descending",n,o),bt("group",n,o),bt("group_level",n,o),bt("skip",n,o),bt("stale",n,o),bt("conflicts",n,o),bt("startkey",n,o,!0),bt("start_key",n,o,!0),bt("endkey",n,o,!0),bt("end_key",n,o,!0),bt("inclusive_end",n,o),bt("key",n,o,!0),o=o.join("&"),o=""===o?"":"?"+o,"undefined"!=typeof n.keys){var a=2e3,s="keys="+encodeURIComponent(JSON.stringify(n.keys));s.length+o.length+1<=a?o+=("?"===o[0]?"&":"?")+s:(i="POST","string"==typeof t?r={keys:n.keys}:t.keys=n.keys)}if("string"==typeof t){var u=ct(t);return e.request({method:i,url:"_design/"+u[0]+"/_view/"+u[1]+o,body:r}).then(_t(n))}return r=r||{},Object.keys(t).forEach(function(e){Array.isArray(t[e])?r[e]=t[e]:r[e]=t[e].toString()}),e.request({method:"POST",url:"_temp_view"+o,body:r}).then(_t(n))}function xt(e,t,n){return new fr(function(r,o){e._query(t,n,function(e,t){return e?o(e):void r(t)})})}function At(e){return new fr(function(t,n){e._viewCleanup(function(e,r){return e?n(e):void t(r)})})}function Tt(e){return function(t){if(404===t.status)return e;throw t}}function Ot(e,t,n){function r(){return ft(f)?fr.resolve(s):t.db.get(a)["catch"](Tt(s))}function o(e){return e.keys.length?t.db.allDocs({keys:e.keys,include_docs:!0}):fr.resolve({rows:[]})}function i(e,t){for(var n=[],r={},o=0,i=t.rows.length;i>o;o++){var a=t.rows[o],s=a.doc;if(s&&(n.push(s),r[s._id]=!0,s._deleted=!c[s._id],!s._deleted)){var u=c[s._id];"value"in u&&(s.value=u.value)}}var f=Object.keys(c);return f.forEach(function(e){if(!r[e]){var t={_id:e},o=c[e];"value"in o&&(t.value=o.value),n.push(t)}}),e.keys=Co(f.concat(e.keys)),n.push(e),n}var a="_local/doc_"+e,s={_id:a,keys:[]},u=n[e],c=u.indexableKeysToKeyValues,f=u.changes;return r().then(function(e){return o(e).then(function(t){return i(e,t)})})}function jt(e,t,n){var r="_local/lastSeq";return e.db.get(r)["catch"](Tt({_id:r,seq:0})).then(function(r){var o=Object.keys(t);return fr.all(o.map(function(n){return Ot(n,e,t)})).then(function(t){var o=Qe(t);return r.seq=n,o.push(r),e.db.bulkDocs({docs:o})})})}function Ct(e){var t="string"==typeof e?e:e.name,n=Ro[t];return n||(n=Ro[t]=new it),n}function It(e){return jo(Ct(e),function(){return Lt(e)})()}function Lt(e){function t(e,t){var n={id:o._id,key:Ao(e)};"undefined"!=typeof t&&null!==t&&(n.value=Ao(t)),r.push(n)}function n(t,n){return function(){return jt(e,t,n)}}var r,o,i;if("function"==typeof e.mapFun&&2===e.mapFun.length){var a=e.mapFun;i=function(e){return a(e,t)}}else i=ut(e.mapFun.toString(),t,gt,mo,Array.isArray,JSON.parse);var s=e.seq||0,u=new it;return new fr(function(t,a){function c(){u.finish().then(function(){e.seq=s,t()})}function f(){function t(e){a(e)}e.sourceDB.changes({conflicts:!0,include_docs:!0,style:"all_docs",since:s,limit:No}).on("complete",function(t){var a=t.results;if(!a.length)return c();for(var l={},d=0,h=a.length;h>d;d++){var p=a[d];if("_"!==p.doc._id[0]){r=[],o=p.doc,o._deleted||dt(e.sourceDB,i,[o]),r.sort(ht);for(var v,y={},_=0,m=r.length;m>_;_++){var g=r[_],b=[g.key,g.id];0===qo(g.key,v)&&b.push(_);var w=xo(b);y[w]=g,v=g.key}l[p.doc._id]={indexableKeysToKeyValues:y,changes:p.changes}}s=p.seq}return u.add(n(l,s)),a.length<No?c():f()}).on("error",t)}f()})}function Rt(e,t,n){0===n.group_level&&delete n.group_level;var r,o=n.group||n.group_level;r=Bo[e.reduceFun]?Bo[e.reduceFun]:ut(e.reduceFun.toString(),null,gt,mo,Array.isArray,JSON.parse);var i=[],a=isNaN(n.group_level)?Number.POSITIVE_INFINITY:n.group_level;t.forEach(function(e){var t=i[i.length-1],n=o?e.key:null;return o&&Array.isArray(n)&&(n=n.slice(0,a)),t&&0===qo(t.groupKey,n)?(t.keys.push([e.key,e.id]),void t.values.push(e.value)):void i.push({keys:[[e.key,e.id]],values:[e.value],groupKey:n})}),t=[];for(var s=0,u=i.length;u>s;s++){var c=i[s],f=dt(e.sourceDB,r,[c.keys,c.values,!1]);if(f.error&&f.error instanceof Pt)throw f.error;t.push({value:f.error?null:f.output,key:c.groupKey})}return{rows:pt(t,n.limit,n.skip)}}function Dt(e,t){return jo(Ct(e),function(){return Nt(e,t)})()}function Nt(e,t){function n(t){return t.include_docs=!0,e.db.allDocs(t).then(function(e){return o=e.total_rows,e.rows.map(function(e){if("value"in e.doc&&"object"==typeof e.doc.value&&null!==e.doc.value){var t=Object.keys(e.doc.value).sort(),n=["id","key","value"];if(!(n>t||t>n))return e.doc.value}var r=To(e.doc._id);return{key:r[0],id:r[1],value:"value"in e.doc?e.doc.value:null}})})}function r(n){var r;if(r=i?Rt(e,n,t):{total_rows:o,offset:a,rows:n},t.include_docs){var s=Co(n.map(vt));return e.sourceDB.allDocs({keys:s,include_docs:!0,conflicts:t.conflicts,attachments:t.attachments,binary:t.binary}).then(function(e){var t={};return e.rows.forEach(function(e){e.doc&&(t["$"+e.id]=e.doc)}),n.forEach(function(e){var n=vt(e),r=t["$"+n];r&&(e.doc=r)}),r})}return r}var o,i=e.reduceFun&&t.reduce!==!1,a=t.skip||0;if("undefined"==typeof t.keys||t.keys.length||(t.limit=0,delete t.keys),"undefined"!=typeof t.keys){var s=t.keys,u=s.map(function(e){var t={startkey:xo([e]),endkey:xo([e,{}])};return n(t)});return fr.all(u).then(Qe).then(r)}var c={descending:t.descending};if(t.start_key&&(t.startkey=t.start_key),t.end_key&&(t.endkey=t.end_key),"undefined"!=typeof t.startkey&&(c.startkey=xo(t.descending?[t.startkey,{}]:[t.startkey])),"undefined"!=typeof t.endkey){var f=t.inclusive_end!==!1;t.descending&&(f=!f),c.endkey=xo(f?[t.endkey,{}]:[t.endkey])}if("undefined"!=typeof t.key){var l=xo([t.key]),d=xo([t.key,{}]);c.descending?(c.endkey=l,c.startkey=d):(c.startkey=l,c.endkey=d)}return i||("number"==typeof t.limit&&(c.limit=t.limit),c.skip=a),n(c).then(r)}function Bt(e){return e.request({method:"POST",url:"_view_cleanup"})}function Mt(e){return e.get("_local/mrviews").then(function(t){var n={};Object.keys(t.views).forEach(function(e){var t=ct(e),r="_design/"+t[0],o=t[1];n[r]=n[r]||{},n[r][o]=!0});var r={keys:Object.keys(n),include_docs:!0};return e.allDocs(r).then(function(r){var o={};r.rows.forEach(function(e){var r=e.key.substring(8);Object.keys(n[e.key]).forEach(function(n){var i=r+"/"+n;t.views[i]||(i=n);var a=Object.keys(t.views[i]),s=e.doc&&e.doc.views&&e.doc.views[n];a.forEach(function(e){o[e]=o[e]||s})})});var i=Object.keys(o).filter(function(e){return!o[e]}),a=i.map(function(t){return jo(Ct(t),function(){return new e.constructor(t,e.__opts).destroy()})()});return fr.all(a).then(function(){return{ok:!0}})})},Tt({ok:!0}))}function Ft(e,t,r){if("http"===e.type())return qt(e,t,r);if("function"==typeof e._query)return xt(e,t,r);if("string"!=typeof t){kt(r,t);var o={db:e,viewName:"temp_view/temp_view",map:t.map,reduce:t.reduce,temporary:!0};return Do.add(function(){return st(o).then(function(e){function t(){return e.db.destroy()}return Io(It(e).then(function(){return Dt(e,r)}),t)})}),Do.finish()}var i=t,a=ct(i),s=a[0],u=a[1];return e.getView(s,u).then(function(t){kt(r,t);var o={db:e,viewName:i,map:t.map,reduce:t.reduce};return st(o).then(function(e){return"ok"===r.stale||"update_after"===r.stale?("update_after"===r.stale&&n.nextTick(function(){It(e)}),Dt(e,r)):It(e).then(function(){return Dt(e,r)})})})}function Ut(e){this.status=400,this.name="query_parse_error",this.message=e,this.error=!0;try{Error.captureStackTrace(this,Ut)}catch(t){}}function Pt(e){this.status=500,this.name="invalid_value",this.message=e,this.error=!0;try{Error.captureStackTrace(this,Pt)}catch(t){}}function Ht(e){return $r(Ge(e))}function Kt(e,t,n){function r(e){try{return Qr(e)}catch(t){var n=A(wr,"Attachment is not a valid base64 string");return{error:n}}}function o(e,n){if(e.stub)return n();if("string"==typeof e.data){var o=r(e.data);if(o.error)return n(o.error);e.length=o.length,"blob"===t?e.data=ge(o,e.content_type):"base64"===t?e.data=$r(o):e.data=o,co(o).then(function(t){e.digest="md5-"+t,n()})}else ue(e.data,function(r){"binary"===t?e.data=Ge(r):"base64"===t&&(e.data=Ht(r)),co(r).then(function(t){e.digest="md5-"+t,e.length=r.byteLength,n()})})}function i(){s++,e.length===s&&(a?n(a):n())}if(!e.length)return n();var a,s=0;e.forEach(function(e){function t(e){a=e,r++,r===n.length&&i()}var n=e.data&&e.data._attachments?Object.keys(e.data._attachments):[],r=0;if(!n.length)return i();for(var s in e.data._attachments)e.data._attachments.hasOwnProperty(s)&&o(e.data._attachments[s],t)})}function Wt(e,t){return e.pos-t.pos}function Jt(e,t,n){for(var r,o=0,i=e.length;i>o;)r=o+i>>>1,n(e[r],t)<0?o=r+1:i=r;return o}function Vt(e,t,n){var r=Jt(e,t,n);e.splice(r,0,t)}function Gt(e,t){for(var n,r,o=t,i=e.length;i>o;o++){var a=e[o],s=[a.id,a.opts,[]];r?(r[2].push(s),r=s):n=r=s}return n}function Xt(e,t){return e[0]<t[0]?-1:1}function zt(e,t){for(var n=[{tree1:e,tree2:t}],r=!1;n.length>0;){var o=n.pop(),i=o.tree1,a=o.tree2;(i[1].status||a[1].status)&&(i[1].status="available"===i[1].status||"available"===a[1].status?"available":"missing");for(var s=0;s<a[2].length;s++)if(i[2][0]){for(var u=!1,c=0;c<i[2].length;c++)i[2][c][0]===a[2][s][0]&&(n.push({tree1:i[2][c],tree2:a[2][s]}),u=!0);u||(r="new_branch",Vt(i[2],a[2][s],Xt))}else r="new_leaf",i[2][0]=a[2][s]}return{conflicts:r,tree:e}}function Qt(e,t,n){var r,o=[],i=!1,a=!1;if(!e.length)return{tree:[t],conflicts:"new_leaf"};for(var s=0,u=e.length;u>s;s++){var c=e[s];if(c.pos===t.pos&&c.ids[0]===t.ids[0])r=zt(c.ids,t.ids),o.push({pos:c.pos,ids:r.tree}),i=i||r.conflicts,a=!0;else if(n!==!0){var f=c.pos<t.pos?c:t,l=c.pos<t.pos?t:c,d=l.pos-f.pos,h=[],p=[];for(p.push({ids:f.ids,diff:d,parent:null,parentIdx:null});p.length>0;){var v=p.pop();if(0!==v.diff)for(var y=v.ids[2],_=0,m=y.length;m>_;_++)p.push({ids:y[_],diff:v.diff-1,parent:v.ids,parentIdx:_});else v.ids[0]===l.ids[0]&&h.push(v)}var g=h[0];g?(r=zt(g.ids,l.ids),g.parent[2][g.parentIdx]=r.tree,o.push({pos:f.pos,ids:f.ids}),i=i||r.conflicts,a=!0):o.push(c)}else o.push(c)}return a||o.push(t),o.sort(Wt),{tree:o,conflicts:i||"internal_node"}}function $t(e,t){for(var n,r=L(e),o={},i=0,a=r.length;a>i;i++){for(var s=r[i],u=s.ids,c=Math.max(0,u.length-t),f={pos:s.pos+c,ids:Gt(u,c)},l=0;c>l;l++){var d=s.pos+l+"-"+u[l].id;o[d]=!0}n=n?Qt(n,f,!0).tree:[f]}return E(n,function(e,t,n){delete o[t+"-"+n]}),{tree:n,revs:Object.keys(o)}}function Yt(e,t,n){var r=Qt(e,t),o=$t(r.tree,n);return{tree:o.tree,stemmedRevs:o.revs,conflicts:r.conflicts}}function Zt(e,t){for(var n,r=e.slice(),o=t.split("-"),i=parseInt(o[0],10),a=o[1];n=r.pop();){if(n.pos===i&&n.ids[0]===a)return!0;for(var s=n.ids[2],u=0,c=s.length;c>u;u++)r.push({pos:n.pos+1,ids:s[u]})}return!1}function en(e,t,n,r,o,i,a,s){if(Zt(t.rev_tree,n.metadata.rev))return r[o]=n,i();var u=t.winningRev||v(t),c="deleted"in t?t.deleted:_(t,u),f="deleted"in n.metadata?n.metadata.deleted:_(n.metadata),l=/^1-/.test(n.metadata.rev);if(c&&!f&&s&&l){var d=n.data;d._rev=u,d._id=n.metadata.id,n=U(d,s)}var h=Yt(t.rev_tree,n.metadata.rev_tree[0],e),p=s&&(c&&f||!c&&"new_leaf"!==h.conflicts||c&&!f&&"new_branch"===h.conflicts);if(p){var y=A(vr);return r[o]=y,i()}var m=n.metadata.rev;n.metadata.rev_tree=h.tree,n.stemmedRevs=h.stemmedRevs||[],t.rev_map&&(n.metadata.rev_map=t.rev_map);var g,b=v(n.metadata),w=_(n.metadata,b),E=c===w?0:w>c?-1:1;g=m===b?w:_(n.metadata,m),a(n,b,w,g,!0,E,o,i)}function tn(e){return"missing"===e.metadata.rev_tree[0].ids[1].status}function nn(e,t,n,r,o,i,a,s,u){function c(e,t,n){var r=v(e.metadata),o=_(e.metadata,r);if("was_delete"in s&&o)return i[t]=A(pr,"deleted"),n();var u=l&&tn(e);if(u){var c=A(vr);return i[t]=c,n()}var f=o?0:1;a(e,r,o,o,!1,f,t,n)}function f(){++h===p&&u&&u()}e=e||1e3;var l=s.new_edits,d=new nr.Map,h=0,p=t.length;t.forEach(function(e,t){if(e._id&&I(e._id)){var r=e._deleted?"_removeLocal":"_putLocal";return void n[r](e,{ctx:o},function(e,n){i[t]=e||n,f()})}var a=e.metadata.id;d.has(a)?(p--,d.get(a).push([e,t])):d.set(a,[[e,t]])}),d.forEach(function(t,n){function o(){++u<t.length?s():f()}function s(){var s=t[u],f=s[0],d=s[1];if(r.has(n))en(e,r.get(n),f,i,d,o,a,l);else{var h=Yt([],f.metadata.rev_tree[0],e);f.metadata.rev_tree=h.tree,f.stemmedRevs=h.stemmedRevs||[],c(f,d,o)}}var u=0;s()})}function rn(e){var t=[];return E(e.rev_tree,function(e,n,r,o,i){"available"!==i.status||e||(t.push(n+"-"+r),i.status="missing")}),t}function on(e){try{return JSON.parse(e)}catch(t){return cr.parse(e)}}function an(e){return e.length<5e4?JSON.parse(e):on(e)}function sn(e){try{return JSON.stringify(e)}catch(t){return cr.stringify(e)}}function un(e,t,n,r){try{e.apply(t,n)}catch(o){r.emit("error",o)}}function cn(e){if(!zo.running&&zo.queue.length){zo.running=!0;var t=zo.queue.shift();t.action(function(r,o){un(t.callback,this,[r,o],e),zo.running=!1,n.nextTick(function(){cn(e)})})}}function fn(e){return function(t){var n="unknown_error";t.target&&t.target.error&&(n=t.target.error.name||t.target.error.message),e(A(Tr,n,t.type))}}function ln(e,t,n){return{data:sn(e),winningRev:t,deletedOrLocal:n?"1":"0",seq:e.seq,id:e.id}}function dn(e){if(!e)return null;var t=an(e.data);return t.winningRev=e.winningRev,t.deleted="1"===e.deletedOrLocal,t.seq=e.seq,t}function hn(e){if(!e)return e;var t=e._doc_id_rev.lastIndexOf(":");return e._id=e._doc_id_rev.substring(0,t-1),e._rev=e._doc_id_rev.substring(t+1),delete e._doc_id_rev,e}function pn(e,t,n,r){n?r(e?"string"!=typeof e?e:Ve(e,t):se([""],{type:t})):e?"string"!=typeof e?Xe(e,function(e){r($r(e))}):r(e):r("")}function vn(e,t,n,r){function o(){++s===a.length&&r&&r()}function i(e,t){var r=e._attachments[t],i=r.digest,a=n.objectStore(Wo).get(i);a.onsuccess=function(e){r.body=e.target.result.body,o()}}var a=Object.keys(e._attachments||{});if(!a.length)return r&&r();var s=0;a.forEach(function(n){t.attachments&&t.include_docs?i(e,n):(e._attachments[n].stub=!0,o())})}function yn(e,t){return fr.all(e.map(function(e){if(e.doc&&e.doc._attachments){var n=Object.keys(e.doc._attachments);return fr.all(n.map(function(n){var r=e.doc._attachments[n];if("body"in r){var o=r.body,a=r.content_type;return new fr(function(s){pn(o,a,t,function(t){e.doc._attachments[n]=$n.extend(i(r,["digest","content_type"]),{data:t}),s()})})}}))}}))}function _n(e,t,n){function r(){c--,c||o()}function o(){i.length&&i.forEach(function(e){var t=u.index("digestSeq").count(IDBKeyRange.bound(e+"::",e+"::￿",!1,!1));t.onsuccess=function(t){var n=t.target.result;n||s["delete"](e)}})}var i=[],a=n.objectStore(Ko),s=n.objectStore(Wo),u=n.objectStore(Jo),c=e.length;e.forEach(function(e){var n=a.index("_doc_id_rev"),o=t+"::"+e;n.getKey(o).onsuccess=function(e){var t=e.target.result;if("number"!=typeof t)return r();a["delete"](t);var n=u.index("seq").openCursor(IDBKeyRange.only(t));n.onsuccess=function(e){var t=e.target.result;if(t){var n=t.value.digestSeq.split("::")[0];i.push(n),u["delete"](t.primaryKey),t["continue"]()}else r()}}})}function mn(e,t,n){try{return{txn:e.transaction(t,n)}}catch(r){return{error:r}}}function gn(e,t,n,r,o,i,a){function s(){var e=[Ho,Ko,Wo,Go,Jo],t=mn(o,e,"readwrite");return t.error?a(t.error):(g=t.txn,g.onabort=fn(a),g.ontimeout=fn(a),g.oncomplete=f,b=g.objectStore(Ho),w=g.objectStore(Ko),E=g.objectStore(Wo),S=g.objectStore(Jo),void d(function(e){return e?(R=!0,a(e)):void c()}))}function u(){nn(e.revs_limit,q,r,L,g,C,h,n)}function c(){function e(){++n===q.length&&u()}function t(t){var n=dn(t.target.result);n&&L.set(n.id,n),e()}if(q.length)for(var n=0,r=0,o=q.length;o>r;r++){var i=q[r];if(i._id&&I(i._id))e();else{var a=b.get(i.metadata.id);a.onsuccess=t}}}function f(){R||(i.notify(r._meta.name),r._meta.docCount+=x,a(null,C))}function l(e,t){var n=E.get(e);n.onsuccess=function(n){if(n.target.result)t();else{var r=A(Rr,"unknown stub attachment with digest "+e);r.status=412,t(r)}}}function d(e){function t(){++o===n.length&&e(r)}var n=[];if(q.forEach(function(e){e.data&&e.data._attachments&&Object.keys(e.data._attachments).forEach(function(t){var r=e.data._attachments[t];r.stub&&n.push(r.digest)})}),!n.length)return e();var r,o=0;n.forEach(function(e){l(e,function(e){e&&!r&&(r=e),t()})})}function h(e,t,n,r,o,i,a,s){x+=i,e.metadata.winningRev=t,e.metadata.deleted=n;var u=e.data;u._id=e.metadata.id,u._rev=e.metadata.rev,r&&(u._deleted=!0);var c=u._attachments&&Object.keys(u._attachments).length;return c?y(e,t,n,o,a,s):void v(e,t,n,o,a,s)}function p(e){var t=rn(e.metadata);_n(t,e.metadata.id,g)}function v(e,t,n,o,i,a){function s(i){o&&r.auto_compaction?p(e):e.stemmedRevs.length&&_n(e.stemmedRevs,e.metadata.id,g),l.seq=i.target.result,delete l.rev;var a=ln(l,t,n),s=b.put(a);s.onsuccess=c}function u(e){e.preventDefault(),e.stopPropagation();var t=w.index("_doc_id_rev"),n=t.getKey(f._doc_id_rev);n.onsuccess=function(e){var t=w.put(f,e.target.result);t.onsuccess=s}}function c(){C[i]={ok:!0,id:l.id,rev:t},L.set(e.metadata.id,e.metadata),_(e,l.seq,a)}var f=e.data,l=e.metadata;f._doc_id_rev=l.id+"::"+l.rev,delete f._id,delete f._rev;var d=w.put(f);d.onsuccess=s,d.onerror=u}function y(e,t,n,r,o,i){function a(){c===f.length&&v(e,t,n,r,o,i)}function s(){c++,a()}var u=e.data,c=0,f=Object.keys(u._attachments);f.forEach(function(n){var r=e.data._attachments[n];if(r.stub)c++,a();else{var o=r.data;delete r.data,r.revpos=parseInt(t,10);var i=r.digest;m(i,o,s)}})}function _(e,t,n){function r(){++i===a.length&&n()}function o(n){var o=e.data._attachments[n].digest,i=S.put({seq:t,digestSeq:o+"::"+t});i.onsuccess=r,i.onerror=function(e){e.preventDefault(),e.stopPropagation(),r()}}var i=0,a=Object.keys(e.data._attachments||{});if(!a.length)return n();for(var s=0;s<a.length;s++)o(a[s])}function m(e,t,n){var r=E.count(e);r.onsuccess=function(r){var o=r.target.result;if(o)return n();var i={digest:e,body:t},a=E.put(i);a.onsuccess=n}}for(var g,b,w,E,S,k,q=t.docs,x=0,T=0,O=q.length;O>T;T++){var j=q[T];j._id&&I(j._id)||(j=q[T]=U(j,n.new_edits),j.error&&!k&&(k=j))}if(k)return a(k);var C=new Array(q.length),L=new nr.Map,R=!1,D=r._meta.blobSupport?"blob":"base64";Kt(q,D,function(e){return e?a(e):void s()})}function bn(e,t,n,r,o){try{if(e&&t)return o?IDBKeyRange.bound(t,e,!n,!1):IDBKeyRange.bound(e,t,!1,!n);if(e)return o?IDBKeyRange.upperBound(e):IDBKeyRange.lowerBound(e);if(t)return o?IDBKeyRange.lowerBound(t,!n):IDBKeyRange.upperBound(t,!n);if(r)return IDBKeyRange.only(r)}catch(i){return{error:i}}return null}function wn(e,t,n,r){return"DataError"===n.name&&0===n.code?r(null,{total_rows:e._meta.docCount,offset:t.skip,rows:[]}):void r(A(Tr,n.name,n.message))}function En(e,t,n,r){function o(e,r){function o(t,n,r){var o=t.id+"::"+r;S.get(o).onsuccess=function(r){n.doc=hn(r.target.result),e.conflicts&&(n.doc._conflicts=q(t)),vn(n.doc,e,g)}}function i(t,n,r){var i={id:r.id,key:r.id,value:{rev:n}},a=r.deleted;if("ok"===e.deleted)k.push(i),a?(i.value.deleted=!0,i.doc=null):e.include_docs&&o(r,i,n);else if(!a&&d--<=0&&(k.push(i),e.include_docs&&o(r,i,n),0===--h))return;t["continue"]()}function a(e){x=t._meta.docCount;var n=e.target.result;if(n){var r=dn(n.value),o=r.winningRev;i(n,o,r)}}function s(){r(null,{total_rows:x,offset:e.skip,rows:k})}function u(){e.attachments?yn(k,e.binary).then(s):s()}var c="startkey"in e?e.startkey:!1,f="endkey"in e?e.endkey:!1,l="key"in e?e.key:!1,d=e.skip||0,h="number"==typeof e.limit?e.limit:-1,p=e.inclusive_end!==!1,v="descending"in e&&e.descending?"prev":null,y=bn(c,f,p,l,v);if(y&&y.error)return wn(t,e,y.error,r);var _=[Ho,Ko];e.attachments&&_.push(Wo);var m=mn(n,_,"readonly");if(m.error)return r(m.error);var g=m.txn,b=g.objectStore(Ho),w=g.objectStore(Ko),E=v?b.openCursor(y,v):b.openCursor(y),S=w.index("_doc_id_rev"),k=[],x=0;g.oncomplete=u,E.onsuccess=a}function i(e,n){return 0===e.limit?n(null,{total_rows:t._meta.docCount,offset:e.skip,rows:[]}):void o(e,n)}i(e,r)}function Sn(e){return new fr(function(t){var n=se([""]);e.objectStore(Xo).put(n,"key"),e.onabort=function(e){e.preventDefault(),e.stopPropagation(),t(!1)},e.oncomplete=function(){var e=navigator.userAgent.match(/Chrome\/(\d+)/),n=navigator.userAgent.match(/Edge\//);t(n||!e||parseInt(e[1],10)>=43)}})["catch"](function(){return!1})}function kn(e){oe()?chrome.storage.onChanged.addListener(function(t){null!=t.db_name&&e.emit(t.dbName.newValue)}):ie()&&("undefined"!=typeof addEventListener?addEventListener("storage",function(t){e.emit(t.key)}):window.attachEvent("storage",function(t){e.emit(t.key)}))}function qn(){or.EventEmitter.call(this),this._listeners={},kn(this)}function xn(e,t){var n=this;zo.queue.push({action:function(t){An(n,e,t)},callback:t}),cn(n.constructor)}function An(e,t,r){function o(e){var t=e.createObjectStore(Ho,{keyPath:"id"});e.createObjectStore(Ko,{autoIncrement:!0}).createIndex("_doc_id_rev","_doc_id_rev",{unique:!0}),e.createObjectStore(Wo,{keyPath:"digest"}),e.createObjectStore(Vo,{keyPath:"id",autoIncrement:!1}),e.createObjectStore(Xo),t.createIndex("deletedOrLocal","deletedOrLocal",{unique:!1}),e.createObjectStore(Go,{keyPath:"_id"});var n=e.createObjectStore(Jo,{autoIncrement:!0});n.createIndex("seq","seq"),n.createIndex("digestSeq","digestSeq",{unique:!0})}function i(e,t){var n=e.objectStore(Ho);n.createIndex("deletedOrLocal","deletedOrLocal",{unique:!1}),n.openCursor().onsuccess=function(e){var r=e.target.result;if(r){var o=r.value,i=_(o);o.deletedOrLocal=i?"1":"0",n.put(o),r["continue"]()}else t()}}function a(e){e.createObjectStore(Go,{keyPath:"_id"}).createIndex("_doc_id_rev","_doc_id_rev",{unique:!0})}function s(e,t){var n=e.objectStore(Go),r=e.objectStore(Ho),o=e.objectStore(Ko),i=r.openCursor();i.onsuccess=function(e){var i=e.target.result;if(i){var a=i.value,s=a.id,u=I(s),c=v(a);if(u){var f=s+"::"+c,l=s+"::",d=s+"::~",h=o.index("_doc_id_rev"),p=IDBKeyRange.bound(l,d,!1,!1),y=h.openCursor(p);y.onsuccess=function(e){if(y=e.target.result){var t=y.value;t._doc_id_rev===f&&n.put(t),o["delete"](y.primaryKey),y["continue"]()}else r["delete"](i.primaryKey),i["continue"]()}}else i["continue"]()}else t&&t()}}function u(e){var t=e.createObjectStore(Jo,{autoIncrement:!0});t.createIndex("seq","seq"),t.createIndex("digestSeq","digestSeq",{unique:!0})}function f(e,t){var n=e.objectStore(Ko),r=e.objectStore(Wo),o=e.objectStore(Jo),i=r.count();i.onsuccess=function(e){var r=e.target.result;return r?void(n.openCursor().onsuccess=function(e){var n=e.target.result;if(!n)return t();for(var r=n.value,i=n.primaryKey,a=Object.keys(r._attachments||{}),s={},u=0;u<a.length;u++){var c=r._attachments[a[u]];s[c.digest]=!0}var f=Object.keys(s);for(u=0;u<f.length;u++){var l=f[u];o.put({seq:i,digestSeq:l+"::"+i})}n["continue"]()}):t()}}function d(e){function t(e){return e.data?dn(e):(e.deleted="1"===e.deletedOrLocal,e)}var n=e.objectStore(Ko),r=e.objectStore(Ho),o=r.openCursor();o.onsuccess=function(e){function o(){var e=s.id+"::",t=s.id+"::￿",r=n.index("_doc_id_rev").openCursor(IDBKeyRange.bound(e,t)),o=0;r.onsuccess=function(e){var t=e.target.result;if(!t)return s.seq=o,i();var n=t.primaryKey;n>o&&(o=n),t["continue"]()}}function i(){var e=ln(s,s.winningRev,s.deleted),t=r.put(e);t.onsuccess=function(){a["continue"]()}}var a=e.target.result;if(a){var s=t(a.value);return s.winningRev=s.winningRev||v(s),s.seq?i():void o()}}}var h=t.name,p=null;e._meta=null,e.type=function(){return"idb"},e._id=l(function(t){t(null,e._meta.instanceId)}),e._bulkDocs=function(n,r,o){gn(t,n,r,e,p,Yo,o)},e._get=function(e,t,n){function r(){n(a,{doc:o,metadata:i,ctx:s})}var o,i,a,s=t.ctx;if(!s){var u=mn(p,[Ho,Ko,Wo],"readonly");if(u.error)return n(u.error);s=u.txn}s.objectStore(Ho).get(e).onsuccess=function(e){if(i=dn(e.target.result),!i)return a=A(pr,"missing"),r();if(_(i)&&!t.rev)return a=A(pr,"deleted"),r();var n=s.objectStore(Ko),u=t.rev||i.winningRev,c=i.id+"::"+u;n.index("_doc_id_rev").get(c).onsuccess=function(e){return o=e.target.result,o&&(o=hn(o)),o?void r():(a=A(pr,"missing"),r())}}},e._getAttachment=function(e,t,n){var r;if(t.ctx)r=t.ctx;else{var o=mn(p,[Ho,Ko,Wo],"readonly");if(o.error)return n(o.error);r=o.txn}var i=e.digest,a=e.content_type;r.objectStore(Wo).get(i).onsuccess=function(e){var r=e.target.result.body;pn(r,a,t.binary,function(e){n(null,e)})}},e._info=function(t){if(null===p||!$o.has(h)){var n=new Error("db isn't open");return n.id="idbNull",t(n)}var r,o,i=mn(p,[Ko],"readonly");if(i.error)return t(i.error);var a=i.txn,s=a.objectStore(Ko).openCursor(null,"prev");s.onsuccess=function(t){var n=t.target.result;r=n?n.key:0,o=e._meta.docCount},a.oncomplete=function(){t(null,{doc_count:o,update_seq:r,idb_attachment_format:e._meta.blobSupport?"binary":"base64"})}},e._allDocs=function(t,n){En(t,e,p,n)},e._changes=function(t){function n(e){function n(){return c.seq!==a?e["continue"]():(u=a,c.winningRev===i._rev?o(i):void r())}function r(){var e=i._id+"::"+c.winningRev,t=_.get(e);t.onsuccess=function(e){o(hn(e.target.result))}}function o(n){var r=t.processChange(n,c,t);r.seq=c.seq;var o=b(r);return"object"==typeof o?t.complete(o):(o&&(g++,l&&m.push(r),t.attachments&&t.include_docs?vn(n,t,d,function(){yn([r],t.binary).then(function(){t.onChange(r)})}):t.onChange(r)),void(g!==f&&e["continue"]()))}var i=hn(e.value),a=e.key;if(s&&!s.has(i._id))return e["continue"]();var c;return(c=w.get(i._id))?n():void(y.get(i._id).onsuccess=function(e){c=dn(e.target.result),w.set(i._id,c),n()})}function r(e){var t=e.target.result;t&&n(t)}function o(){var e=[Ho,Ko];t.attachments&&e.push(Wo);var n=mn(p,e,"readonly");if(n.error)return t.complete(n.error);d=n.txn,d.onabort=fn(t.complete),d.oncomplete=i,v=d.objectStore(Ko),y=d.objectStore(Ho),_=v.index("_doc_id_rev");var o;o=t.descending?v.openCursor(null,"prev"):v.openCursor(IDBKeyRange.lowerBound(t.since,!0)),o.onsuccess=r}function i(){function e(){t.complete(null,{results:m,last_seq:u})}!t.continuous&&t.attachments?yn(m).then(e):e()}if(t=c(t),t.continuous){var a=h+":"+D();return Yo.addListener(h,a,e,t),Yo.notify(h),{cancel:function(){Yo.removeListener(h,a)}}}var s=t.doc_ids&&new nr.Set(t.doc_ids);t.since=t.since||0;var u=t.since,f="limit"in t?t.limit:-1;0===f&&(f=1);var l;l="return_docs"in t?t.return_docs:"returnDocs"in t?t.returnDocs:!0;var d,v,y,_,m=[],g=0,b=we(t),w=new nr.Map;o()},e._close=function(e){return null===p?e(A(gr)):(p.close(),$o["delete"](h),
p=null,void e())},e._getRevisionTree=function(e,t){var n=mn(p,[Ho],"readonly");if(n.error)return t(n.error);var r=n.txn,o=r.objectStore(Ho).get(e);o.onsuccess=function(e){var n=dn(e.target.result);n?t(null,n.rev_tree):t(A(pr))}},e._doCompaction=function(e,t,n){var r=[Ho,Ko,Wo,Jo],o=mn(p,r,"readwrite");if(o.error)return n(o.error);var i=o.txn,a=i.objectStore(Ho);a.get(e).onsuccess=function(n){var r=dn(n.target.result);E(r.rev_tree,function(e,n,r,o,i){var a=n+"-"+r;-1!==t.indexOf(a)&&(i.status="missing")}),_n(t,e,i);var o=r.winningRev,a=r.deleted;i.objectStore(Ho).put(ln(r,o,a))},i.onabort=fn(n),i.oncomplete=function(){n()}},e._getLocal=function(e,t){var n=mn(p,[Go],"readonly");if(n.error)return t(n.error);var r=n.txn,o=r.objectStore(Go).get(e);o.onerror=fn(t),o.onsuccess=function(e){var n=e.target.result;n?(delete n._doc_id_rev,t(null,n)):t(A(pr))}},e._putLocal=function(e,t,n){"function"==typeof t&&(n=t,t={}),delete e._revisions;var r=e._rev,o=e._id;r?e._rev="0-"+(parseInt(r.split("-")[1],10)+1):e._rev="0-1";var i,a=t.ctx;if(!a){var s=mn(p,[Go],"readwrite");if(s.error)return n(s.error);a=s.txn,a.onerror=fn(n),a.oncomplete=function(){i&&n(null,i)}}var u,c=a.objectStore(Go);r?(u=c.get(o),u.onsuccess=function(o){var a=o.target.result;if(a&&a._rev===r){var s=c.put(e);s.onsuccess=function(){i={ok:!0,id:e._id,rev:e._rev},t.ctx&&n(null,i)}}else n(A(vr))}):(u=c.add(e),u.onerror=function(e){n(A(vr)),e.preventDefault(),e.stopPropagation()},u.onsuccess=function(){i={ok:!0,id:e._id,rev:e._rev},t.ctx&&n(null,i)})},e._removeLocal=function(e,t,n){"function"==typeof t&&(n=t,t={});var r=t.ctx;if(!r){var o=mn(p,[Go],"readwrite");if(o.error)return n(o.error);r=o.txn,r.oncomplete=function(){i&&n(null,i)}}var i,a=e._id,s=r.objectStore(Go),u=s.get(a);u.onerror=fn(n),u.onsuccess=function(r){var o=r.target.result;o&&o._rev===e._rev?(s["delete"](a),i={ok:!0,id:a,rev:"0-0"},t.ctx&&n(null,i)):n(A(pr))}},e._destroy=function(e,t){Yo.removeAllListeners(h);var n=Zo.get(h);n&&n.result&&(n.result.close(),$o["delete"](h));var r=indexedDB.deleteDatabase(h);r.onsuccess=function(){Zo["delete"](h),ie()&&h in localStorage&&delete localStorage[h],t(null,{ok:!0})},r.onerror=fn(t)};var y=$o.get(h);if(y)return p=y.idb,e._meta=y.global,void n.nextTick(function(){r(null,e)});var m;m=t.storage?Tn(h,t.storage):indexedDB.open(h,Po),Zo.set(h,m),m.onupgradeneeded=function(e){function t(){var e=c[l-1];l++,e&&e(r,t)}var n=e.target.result;if(e.oldVersion<1)return o(n);var r=e.currentTarget.transaction;e.oldVersion<3&&a(n),e.oldVersion<4&&u(n);var c=[i,s,f,d],l=e.oldVersion;t()},m.onsuccess=function(t){p=t.target.result,p.onversionchange=function(){p.close(),$o["delete"](h)},p.onabort=function(e){console.error("Database has a global failure",e.target.error),p.close(),$o["delete"](h)};var n=p.transaction([Vo,Xo,Ho],"readwrite"),o=n.objectStore(Vo).get(Vo),i=null,a=null,s=null;o.onsuccess=function(t){var o=function(){null!==i&&null!==a&&null!==s&&(e._meta={name:h,instanceId:s,blobSupport:i,docCount:a},$o.set(h,{idb:p,global:e._meta}),r(null,e))},u=t.target.result||{id:Vo};h+"_id"in u?(s=u[h+"_id"],o()):(s=D(),u[h+"_id"]=s,n.objectStore(Vo).put(u).onsuccess=function(){o()}),Qo||(Qo=Sn(n)),Qo.then(function(e){i=e,o()});var c=n.objectStore(Ho).index("deletedOrLocal");c.count(IDBKeyRange.only("0")).onsuccess=function(e){a=e.target.result,o()}}},m.onerror=function(){var e="Failed to open indexedDB, are you in private browsing mode?";console.error(e),r(A(Tr,e))}}function Tn(e,t){try{return indexedDB.open(e,{version:Po,storage:t})}catch(n){return indexedDB.open(e,Po)}}function On(e){return decodeURIComponent(window.escape(e))}function jn(e){return 65>e?e-48:e-55}function Cn(e,t,n){for(var r="";n>t;)r+=String.fromCharCode(jn(e.charCodeAt(t++))<<4|jn(e.charCodeAt(t++)));return r}function In(e,t,n){for(var r="";n>t;)r+=String.fromCharCode(jn(e.charCodeAt(t+2))<<12|jn(e.charCodeAt(t+3))<<8|jn(e.charCodeAt(t))<<4|jn(e.charCodeAt(t+1))),t+=4;return r}function Ln(e,t){return"UTF-8"===t?On(Cn(e,0,e.length)):In(e,0,e.length)}function Rn(e){return"'"+e+"'"}function Dn(){return"undefined"!=typeof sqlitePlugin?sqlitePlugin.openDatabase.bind(sqlitePlugin):"undefined"!=typeof openDatabase?function(e){return openDatabase(e.name,e.version,e.description,e.size)}:void 0}function Nn(){return"undefined"!=typeof openDatabase||"undefined"!=typeof SQLitePlugin}function Bn(e){return e.replace(/\u0002/g,"").replace(/\u0001/g,"").replace(/\u0000/g,"")}function Mn(e){return e.replace(/\u0001\u0001/g,"\x00").replace(/\u0001\u0002/g,"").replace(/\u0002\u0002/g,"")}function Fn(e){return delete e._id,delete e._rev,JSON.stringify(e)}function Un(e,t,n){return e=JSON.parse(e),e._id=t,e._rev=n,e}function Pn(e){for(var t="(";e--;)t+="?",e&&(t+=",");return t+")"}function Hn(e,t,n,r,o){return"SELECT "+e+" FROM "+("string"==typeof t?t:t.join(" JOIN "))+(n?" ON "+n:"")+(r?" WHERE "+("string"==typeof r?r:r.join(" AND ")):"")+(o?" ORDER BY "+o:"")}function Kn(e,t,n){function r(){++i===e.length&&o()}function o(){if(a.length){var e="SELECT DISTINCT digest AS digest FROM "+ai+" WHERE seq IN "+Pn(a.length);n.executeSql(e,a,function(e,t){for(var n=[],r=0;r<t.rows.length;r++)n.push(t.rows.item(r).digest);if(n.length){var o="DELETE FROM "+ai+" WHERE seq IN ("+a.map(function(){return"?"}).join(",")+")";e.executeSql(o,a,function(e){var t="SELECT digest FROM "+ai+" WHERE digest IN ("+n.map(function(){return"?"}).join(",")+")";e.executeSql(t,n,function(e,t){for(var r=new nr.Set,o=0;o<t.rows.length;o++)r.add(t.rows.item(o).digest);n.forEach(function(t){r.has(t)||(e.executeSql("DELETE FROM "+ai+" WHERE digest=?",[t]),e.executeSql("DELETE FROM "+ri+" WHERE digest=?",[t]))})})})}})}}if(e.length){var i=0,a=[];e.forEach(function(e){var o="SELECT seq FROM "+ni+" WHERE doc_id=? AND rev=?";n.executeSql(o,[t,e],function(e,t){if(!t.rows.length)return r();var n=t.rows.item(0).seq;a.push(n),e.executeSql("DELETE FROM "+ni+" WHERE seq=?",[n],r)})})}}function Wn(e){return function(t){console.error("WebSQL threw an error",t);var n=t&&t.constructor.toString().match(/function ([^\(]+)/),r=n&&n[1]||t.type,o=t.target||t.message;e(A(Or,o,r))}}function Jn(e){if("size"in e)return 1e6*e.size;var t="undefined"!=typeof navigator&&/Android/.test(navigator.userAgent);return t?5e6:1}function Vn(e,t){try{return{db:e(t)}}catch(n){return{error:n}}}function Gn(e){var t=si.get(e.name);if(!t){var n=Dn();t=Vn(n,e),si.set(e.name,t),t.db&&(t.db._sqlitePlugin="undefined"!=typeof sqlitePlugin)}return t}function Xn(e,t,n,r,o,i,a){function s(){return g?a(g):(i.notify(r._name),r._docCount=-1,void a(null,b))}function u(e,t){var n="SELECT count(*) as cnt FROM "+ri+" WHERE digest=?";m.executeSql(n,[e],function(n,r){if(0===r.rows.item(0).cnt){var o=A(Rr,"unknown stub attachment with digest "+e);t(o)}else t()})}function c(e){function t(){++o===n.length&&e(r)}var n=[];if(y.forEach(function(e){e.data&&e.data._attachments&&Object.keys(e.data._attachments).forEach(function(t){var r=e.data._attachments[t];r.stub&&n.push(r.digest)})}),!n.length)return e();var r,o=0;n.forEach(function(e){u(e,function(e){e&&!r&&(r=e),t()})})}function f(e,t,n,o,i,a,s,u){function c(){function t(e,t){function r(){return++i===a.length&&t(),!1}function o(t){var o="INSERT INTO "+ai+" (digest, seq) VALUES (?,?)",i=[n._attachments[t].digest,e];m.executeSql(o,i,r,r)}var i=0,a=Object.keys(n._attachments||{});if(!a.length)return t();for(var s=0;s<a.length;s++)o(a[s])}var n=e.data,r=o?1:0,i=n._id,a=n._rev,s=Fn(n),u="INSERT INTO "+ni+" (doc_id, rev, json, deleted) VALUES (?, ?, ?, ?);",c=[i,a,s,r];m.executeSql(u,c,function(e,n){var r=n.insertId;t(r,function(){d(e,r)})},function(){var e=Hn("seq",ni,null,"doc_id=? AND rev=?");return m.executeSql(e,[i,a],function(e,n){var o=n.rows.item(0).seq,u="UPDATE "+ni+" SET json=?, deleted=? WHERE doc_id=? AND rev=?;",c=[s,r,i,a];e.executeSql(u,c,function(e){t(o,function(){d(e,o)})})}),!1})}function f(e){p||(e?(p=e,u(p)):v===y.length&&c())}function l(e){v++,f(e)}function d(n,o){var a=e.metadata.id;i&&r.auto_compaction?Kn(rn(e.metadata),a,n):e.stemmedRevs.length&&Kn(e.stemmedRevs,a,n),e.metadata.seq=o,delete e.metadata.rev;var c=i?"UPDATE "+ti+" SET json=?, max_seq=?, winningseq=(SELECT seq FROM "+ni+" WHERE doc_id="+ti+".id AND rev=?) WHERE id=?":"INSERT INTO "+ti+" (id, winningseq, max_seq, json) VALUES (?,?,?,?);",f=sn(e.metadata),l=i?[f,o,t,a]:[a,o,o,f];n.executeSql(c,l,function(){b[s]={ok:!0,id:e.metadata.id,rev:t},w.set(a,e.metadata),u()})}var p=null,v=0;e.data._id=e.metadata.id,e.data._rev=e.metadata.rev;var y=Object.keys(e.data._attachments||{});o&&(e.data._deleted=!0),y.forEach(function(n){var r=e.data._attachments[n];if(r.stub)v++,f();else{var o=r.data;delete r.data,r.revpos=parseInt(t,10);var i=r.digest;h(i,o,l)}}),y.length||c()}function l(){nn(e.revs_limit,y,r,w,m,b,f,n)}function d(e){function t(){++n===y.length&&e()}if(!y.length)return e();var n=0;y.forEach(function(e){if(e._id&&I(e._id))return t();var n=e.metadata.id;m.executeSql("SELECT json FROM "+ti+" WHERE id = ?",[n],function(e,r){if(r.rows.length){var o=an(r.rows.item(0).json);w.set(n,o)}t()})})}function h(e,t,n){var r="SELECT digest FROM "+ri+" WHERE digest=?";m.executeSql(r,[e],function(o,i){return i.rows.length?n():(r="INSERT INTO "+ri+" (digest, body, escaped) VALUES (?,?,1)",void o.executeSql(r,[e,Bn(t)],function(){n()},function(){return n(),!1}))})}var p=n.new_edits,v=t.docs,y=v.map(function(e){if(e._id&&I(e._id))return e;var t=U(e,p);return t}),_=y.filter(function(e){return e.error});if(_.length)return a(_[0]);var m,g,b=new Array(y.length),w=new nr.Map;Kt(y,"binary",function(e){return e?a(e):void o.transaction(function(e){m=e,c(function(e){e?g=e:d(l)})},Wn(a),s)})}function zn(e,t,n,r,o){function a(){++c===u.length&&o&&o()}function s(e,o){var s=e._attachments[o],u={binary:t.binary,ctx:r};n._getAttachment(s,u,function(t,n){e._attachments[o]=$n.extend(i(s,["digest","content_type"]),{data:n}),a()})}var u=Object.keys(e._attachments||{});if(!u.length)return o&&o();var c=0;u.forEach(function(n){t.attachments&&t.include_docs?s(e,n):(e._attachments[n].stub=!0,a())})}function Qn(e,t){function n(){ie()&&(window.localStorage["_pouch__websqldb_"+g._name]=!0),t(null,g)}function r(e,t){e.executeSql(di),e.executeSql("ALTER TABLE "+ni+" ADD COLUMN deleted TINYINT(1) DEFAULT 0",[],function(){e.executeSql(fi),e.executeSql("ALTER TABLE "+ti+" ADD COLUMN local TINYINT(1) DEFAULT 0",[],function(){e.executeSql("CREATE INDEX IF NOT EXISTS 'doc-store-local-idx' ON "+ti+" (local, id)");var n="SELECT "+ti+".winningseq AS seq, "+ti+".json AS metadata FROM "+ni+" JOIN "+ti+" ON "+ni+".seq = "+ti+".winningseq";e.executeSql(n,[],function(e,n){for(var r=[],o=[],i=0;i<n.rows.length;i++){var a=n.rows.item(i),s=a.seq,u=JSON.parse(a.metadata);_(u)&&r.push(s),I(u.id)&&o.push(u.id)}e.executeSql("UPDATE "+ti+"SET local = 1 WHERE id IN "+Pn(o.length),o,function(){e.executeSql("UPDATE "+ni+" SET deleted = 1 WHERE seq IN "+Pn(r.length),r,t)})})})})}function o(e,t){var n="CREATE TABLE IF NOT EXISTS "+oi+" (id UNIQUE, rev, json)";e.executeSql(n,[],function(){var n="SELECT "+ti+".id AS id, "+ni+".json AS data FROM "+ni+" JOIN "+ti+" ON "+ni+".seq = "+ti+".winningseq WHERE local = 1";e.executeSql(n,[],function(e,n){function r(){if(!o.length)return t(e);var n=o.shift(),i=JSON.parse(n.data)._rev;e.executeSql("INSERT INTO "+oi+" (id, rev, json) VALUES (?,?,?)",[n.id,i,n.data],function(e){e.executeSql("DELETE FROM "+ti+" WHERE id=?",[n.id],function(e){e.executeSql("DELETE FROM "+ni+" WHERE seq=?",[n.seq],function(){r()})})})}for(var o=[],i=0;i<n.rows.length;i++)o.push(n.rows.item(i));r()})})}function i(e,t){function n(n){function r(){if(!n.length)return t(e);var o=n.shift(),i=Ln(o.hex,m),a=i.lastIndexOf("::"),s=i.substring(0,a),u=i.substring(a+2),c="UPDATE "+ni+" SET doc_id=?, rev=? WHERE doc_id_rev=?";e.executeSql(c,[s,u,i],function(){r()})}r()}var r="ALTER TABLE "+ni+" ADD COLUMN doc_id";e.executeSql(r,[],function(e){var t="ALTER TABLE "+ni+" ADD COLUMN rev";e.executeSql(t,[],function(e){e.executeSql(li,[],function(e){var t="SELECT hex(doc_id_rev) as hex FROM "+ni;e.executeSql(t,[],function(e,t){for(var r=[],o=0;o<t.rows.length;o++)r.push(t.rows.item(o));n(r)})})})})}function a(e,t){function n(e){var n="SELECT COUNT(*) AS cnt FROM "+ri;e.executeSql(n,[],function(e,n){function r(){var n=Hn(yi+", "+ti+".id AS id",[ti,ni],vi,null,ti+".id ");n+=" LIMIT "+a+" OFFSET "+i,i+=a,e.executeSql(n,[],function(e,n){function o(e,t){var n=i[e]=i[e]||[];-1===n.indexOf(t)&&n.push(t)}if(!n.rows.length)return t(e);for(var i={},a=0;a<n.rows.length;a++)for(var s=n.rows.item(a),u=Un(s.data,s.id,s.rev),c=Object.keys(u._attachments||{}),f=0;f<c.length;f++){var l=u._attachments[c[f]];o(l.digest,s.seq)}var d=[];if(Object.keys(i).forEach(function(e){var t=i[e];t.forEach(function(t){d.push([e,t])})}),!d.length)return r();var h=0;d.forEach(function(t){var n="INSERT INTO "+ai+" (digest, seq) VALUES (?,?)";e.executeSql(n,t,function(){++h===d.length&&r()})})})}var o=n.rows.item(0).cnt;if(!o)return t(e);var i=0,a=10;r()})}var r="CREATE TABLE IF NOT EXISTS "+ai+" (digest, seq INTEGER)";e.executeSql(r,[],function(e){e.executeSql(pi,[],function(e){e.executeSql(hi,[],n)})})}function s(e,t){var n="ALTER TABLE "+ri+" ADD COLUMN escaped TINYINT(1) DEFAULT 0";e.executeSql(n,[],t)}function u(e,t){var n="ALTER TABLE "+ti+" ADD COLUMN max_seq INTEGER";e.executeSql(n,[],function(e){var n="UPDATE "+ti+" SET max_seq=(SELECT MAX(seq) FROM "+ni+" WHERE doc_id=id)";e.executeSql(n,[],function(e){var n="CREATE UNIQUE INDEX IF NOT EXISTS 'doc-max-seq-idx' ON "+ti+" (max_seq)";e.executeSql(n,[],t)})})}function f(e,t){e.executeSql('SELECT HEX("a") AS hex',[],function(e,n){var r=n.rows.item(0).hex;m=2===r.length?"UTF-8":"UTF-16",t()})}function d(){for(;S.length>0;){var e=S.pop();e(null,b)}}function h(e,t){if(0===t){var n="CREATE TABLE IF NOT EXISTS "+ii+" (dbid, db_version INTEGER)",c="CREATE TABLE IF NOT EXISTS "+ri+" (digest UNIQUE, escaped TINYINT(1), body BLOB)",f="CREATE TABLE IF NOT EXISTS "+ai+" (digest, seq INTEGER)",l="CREATE TABLE IF NOT EXISTS "+ti+" (id unique, json, winningseq, max_seq INTEGER UNIQUE)",h="CREATE TABLE IF NOT EXISTS "+ni+" (seq INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, json, deleted TINYINT(1), doc_id, rev)",p="CREATE TABLE IF NOT EXISTS "+oi+" (id UNIQUE, rev, json)";e.executeSql(c),e.executeSql(p),e.executeSql(f,[],function(){e.executeSql(hi),e.executeSql(pi)}),e.executeSql(l,[],function(){e.executeSql(di),e.executeSql(h,[],function(){e.executeSql(fi),e.executeSql(li),e.executeSql(n,[],function(){var t="INSERT INTO "+ii+" (db_version, dbid) VALUES (?,?)";b=D();var n=[ei,b];e.executeSql(t,n,function(){d()})})})})}else{var v=function(){var n=ei>t;n&&e.executeSql("UPDATE "+ii+" SET db_version = "+ei);var r="SELECT dbid FROM "+ii;e.executeSql(r,[],function(e,t){b=t.rows.item(0).dbid,d()})},y=[r,o,i,a,s,u,v],_=t,m=function(e){y[_-1](e,m),_++};m(e)}}function p(){T.transaction(function(e){f(e,function(){v(e)})},Wn(t),n)}function v(e){var t="SELECT sql FROM sqlite_master WHERE tbl_name = "+ii;e.executeSql(t,[],function(e,t){t.rows.length?/db_version/.test(t.rows.item(0).sql)?e.executeSql("SELECT db_version FROM "+ii,[],function(e,t){var n=t.rows.item(0).db_version;h(e,n)}):e.executeSql("ALTER TABLE "+ii+" ADD COLUMN db_version INTEGER",[],function(){h(e,1)}):h(e,0)})}function y(e,t){if(-1!==g._docCount)return t(g._docCount);var n=Hn("COUNT("+ti+".id) AS 'num'",[ti,ni],vi,ni+".deleted=0");e.executeSql(n,[],function(e,n){g._docCount=n.rows.item(0).num,t(g._docCount)})}var m,g=this,b=null,w=Jn(e),S=[];g._docCount=-1,g._name=e.name;var k=$n.extend({},e,{size:w,version:ci}),x=Gn(k);if(x.error)return Wn(t)(x.error);var T=x.db;"function"!=typeof T.readTransaction&&(T.readTransaction=T.transaction),p(),g.type=function(){return"websql"},g._id=l(function(e){e(null,b)}),g._info=function(e){T.readTransaction(function(t){y(t,function(n){var r="SELECT MAX(seq) AS seq FROM "+ni;t.executeSql(r,[],function(t,r){var o=r.rows.item(0).seq||0;e(null,{doc_count:n,update_seq:o,sqlite_plugin:T._sqlitePlugin,websql_encoding:m})})})},Wn(e))},g._bulkDocs=function(t,n,r){Xn(e,t,n,g,T,ui,r)},g._get=function(e,t,n){function r(){n(a,{doc:o,metadata:i,ctx:s})}var o,i,a,s=t.ctx;if(!s)return T.readTransaction(function(r){g._get(e,$n.extend({ctx:r},t),n)});var u,c;t.rev?(u=Hn(yi,[ti,ni],ti+".id="+ni+".doc_id",[ni+".doc_id=?",ni+".rev=?"]),c=[e,t.rev]):(u=Hn(yi,[ti,ni],vi,ti+".id=?"),c=[e]),s.executeSql(u,c,function(e,n){if(!n.rows.length)return a=A(pr,"missing"),r();var s=n.rows.item(0);return i=an(s.metadata),s.deleted&&!t.rev?(a=A(pr,"deleted"),r()):(o=Un(s.data,i.id,s.rev),void r())})},g._allDocs=function(e,t){var n,r=[],o="startkey"in e?e.startkey:!1,i="endkey"in e?e.endkey:!1,a="key"in e?e.key:!1,s="descending"in e?e.descending:!1,u="limit"in e?e.limit:-1,c="skip"in e?e.skip:0,f=e.inclusive_end!==!1,l=[],d=[];if(a!==!1)d.push(ti+".id = ?"),l.push(a);else if(o!==!1||i!==!1){if(o!==!1&&(d.push(ti+".id "+(s?"<=":">=")+" ?"),l.push(o)),i!==!1){var h=s?">":"<";f&&(h+="="),d.push(ti+".id "+h+" ?"),l.push(i)}a!==!1&&(d.push(ti+".id = ?"),l.push(a))}"ok"!==e.deleted&&d.push(ni+".deleted = 0"),T.readTransaction(function(t){y(t,function(o){if(n=o,0!==u){var i=Hn(yi,[ti,ni],vi,d,ti+".id "+(s?"DESC":"ASC"));i+=" LIMIT "+u+" OFFSET "+c,t.executeSql(i,l,function(t,n){for(var o=0,i=n.rows.length;i>o;o++){var a=n.rows.item(o),s=an(a.metadata),u=s.id,c=Un(a.data,u,a.rev),f=c._rev,l={id:u,key:u,value:{rev:f}};if(e.include_docs&&(l.doc=c,l.doc._rev=f,e.conflicts&&(l.doc._conflicts=q(s)),zn(l.doc,e,g,t)),a.deleted){if("ok"!==e.deleted)continue;l.value.deleted=!0,l.doc=null}r.push(l)}})}})},Wn(t),function(){t(null,{total_rows:n,offset:e.skip,rows:r})})},g._changes=function(e){function t(){var t=ti+".json AS metadata, "+ti+".max_seq AS maxSeq, "+ni+".json AS winningDoc, "+ni+".rev AS winningRev ",n=ti+" JOIN "+ni,u=ti+".id="+ni+".doc_id AND "+ti+".winningseq="+ni+".seq",c=["maxSeq > ?"],f=[e.since];e.doc_ids&&(c.push(ti+".id IN "+Pn(e.doc_ids.length)),f=f.concat(e.doc_ids));var l="maxSeq "+(r?"DESC":"ASC"),d=Hn(t,n,u,c,l),h=we(e);e.view||e.filter||(d+=" LIMIT "+o);var p=e.since||0;T.readTransaction(function(t){t.executeSql(d,f,function(t,n){function r(t){return function(){e.onChange(t)}}for(var u=0,c=n.rows.length;c>u;u++){var f=n.rows.item(u),l=an(f.metadata);p=f.maxSeq;var d=Un(f.winningDoc,l.id,f.winningRev),v=e.processChange(d,l,e);v.seq=f.maxSeq;var y=h(v);if("object"==typeof y)return e.complete(y);if(y&&(s++,i&&a.push(v),e.attachments&&e.include_docs?zn(d,e,g,t,r(v)):r(v)()),s===o)break}})},Wn(e.complete),function(){e.continuous||e.complete(null,{results:a,last_seq:p})})}if(e=c(e),e.continuous){var n=g._name+":"+D();return ui.addListener(g._name,n,g,e),ui.notify(g._name),{cancel:function(){ui.removeListener(g._name,n)}}}var r=e.descending;e.since=e.since&&!r?e.since:0;var o="limit"in e?e.limit:-1;0===o&&(o=1);var i;i="return_docs"in e?e.return_docs:"returnDocs"in e?e.returnDocs:!0;var a=[],s=0;t()},g._close=function(e){e()},g._getAttachment=function(e,t,n){var r,o=t.ctx,i=e.digest,a=e.content_type,s="SELECT escaped, CASE WHEN escaped = 1 THEN body ELSE HEX(body) END AS body FROM "+ri+" WHERE digest=?";o.executeSql(s,[i],function(e,o){var i=o.rows.item(0),s=i.escaped?Mn(i.body):Ln(i.body,m);r=t.binary?ge(s,a):$r(s),n(null,r)})},g._getRevisionTree=function(e,t){T.readTransaction(function(n){var r="SELECT json AS metadata FROM "+ti+" WHERE id = ?";n.executeSql(r,[e],function(e,n){if(n.rows.length){var r=an(n.rows.item(0).metadata);t(null,r.rev_tree)}else t(A(pr))})})},g._doCompaction=function(e,t,n){return t.length?void T.transaction(function(n){var r="SELECT json AS metadata FROM "+ti+" WHERE id = ?";n.executeSql(r,[e],function(n,r){var o=an(r.rows.item(0).metadata);E(o.rev_tree,function(e,n,r,o,i){var a=n+"-"+r;-1!==t.indexOf(a)&&(i.status="missing")});var i="UPDATE "+ti+" SET json = ? WHERE id = ?";n.executeSql(i,[sn(o),e])}),Kn(t,e,n)},Wn(n),function(){n()}):n()},g._getLocal=function(e,t){T.readTransaction(function(n){var r="SELECT json, rev FROM "+oi+" WHERE id=?";n.executeSql(r,[e],function(n,r){if(r.rows.length){var o=r.rows.item(0),i=Un(o.json,e,o.rev);t(null,i)}else t(A(pr))})})},g._putLocal=function(e,t,n){function r(e){var r,c;i?(r="UPDATE "+oi+" SET rev=?, json=? WHERE id=? AND rev=?",c=[o,u,a,i]):(r="INSERT INTO "+oi+" (id, rev, json) VALUES (?,?,?)",c=[a,o,u]),e.executeSql(r,c,function(e,r){r.rowsAffected?(s={ok:!0,id:a,rev:o},t.ctx&&n(null,s)):n(A(vr))},function(){return n(A(vr)),!1})}"function"==typeof t&&(n=t,t={}),delete e._revisions;var o,i=e._rev,a=e._id;o=i?e._rev="0-"+(parseInt(i.split("-")[1],10)+1):e._rev="0-1";var s,u=Fn(e);t.ctx?r(t.ctx):T.transaction(r,Wn(n),function(){s&&n(null,s)})},g._removeLocal=function(e,t,n){function r(r){var i="DELETE FROM "+oi+" WHERE id=? AND rev=?",a=[e._id,e._rev];r.executeSql(i,a,function(r,i){return i.rowsAffected?(o={ok:!0,id:e._id,rev:"0-0"},void(t.ctx&&n(null,o))):n(A(pr))})}"function"==typeof t&&(n=t,t={});var o;t.ctx?r(t.ctx):T.transaction(r,Wn(n),function(){o&&n(null,o)})},g._destroy=function(e,t){ui.removeAllListeners(g._name),T.transaction(function(e){var t=[ti,ni,ri,ii,oi,ai];t.forEach(function(t){e.executeSql("DROP TABLE IF EXISTS "+t,[])})},Wn(t),function(){ie()&&(delete window.localStorage["_pouch__websqldb_"+g._name],delete window.localStorage[g._name]),t(null,{ok:!0})})}}var $n=e(7),Yn=o($n),Zn=o(e(2)),er=o(e(6)),tr=o(e(8)),nr=e(12),rr=o(e(1)),or=e(4),ir=o(e(14)),ar=e(10),sr=o(ar),ur=o(e(15)),cr=o(e(16)),fr="function"==typeof Promise?Promise:tr,lr=Zn("pouchdb:api");er(x,Error),x.prototype.toString=function(){return JSON.stringify({status:this.status,name:this.name,message:this.message,reason:this.reason})};var dr=new x({status:401,error:"unauthorized",reason:"Name or password is incorrect."}),hr=new x({status:400,error:"bad_request",reason:"Missing JSON list of 'docs'"}),pr=new x({status:404,error:"not_found",reason:"missing"}),vr=new x({status:409,error:"conflict",reason:"Document update conflict"}),yr=new x({status:400,error:"invalid_id",reason:"_id field must contain a string"}),_r=new x({status:412,error:"missing_id",reason:"_id is required for puts"}),mr=new x({status:400,error:"bad_request",reason:"Only reserved document ids may start with underscore."}),gr=new x({status:412,error:"precondition_failed",reason:"Database not open"}),br=new x({status:500,error:"unknown_error",reason:"Database encountered an unknown error"}),wr=new x({status:500,error:"badarg",reason:"Some query argument is invalid"}),Er=new x({status:400,error:"invalid_request",reason:"Request was invalid"}),Sr=new x({status:400,error:"query_parse_error",reason:"Some query parameter is invalid"}),kr=new x({status:500,error:"doc_validation",reason:"Bad special document member"}),qr=new x({status:400,error:"bad_request",reason:"Something wrong with the request"}),xr=new x({status:400,error:"bad_request",reason:"Document must be a JSON object"}),Ar=new x({status:404,error:"not_found",reason:"Database not found"}),Tr=new x({status:500,error:"indexed_db_went_bad",reason:"unknown"}),Or=new x({status:500,error:"web_sql_went_bad",reason:"unknown"}),jr=new x({status:500,error:"levelDB_went_went_bad",reason:"unknown"}),Cr=new x({status:403,error:"forbidden",reason:"Forbidden by design doc validate_doc_update function"}),Ir=new x({status:400,error:"bad_request",reason:"Invalid rev format"}),Lr=new x({status:412,error:"file_exists",reason:"The database could not be created, the file already exists."}),Rr=new x({status:412,error:"missing_stub"}),Dr=new x({status:413,error:"invalid_url",reason:"Provided URL is invalid"}),Nr={UNAUTHORIZED:dr,MISSING_BULK_DOCS:hr,MISSING_DOC:pr,REV_CONFLICT:vr,INVALID_ID:yr,MISSING_ID:_r,RESERVED_ID:mr,NOT_OPEN:gr,UNKNOWN_ERROR:br,BAD_ARG:wr,INVALID_REQUEST:Er,QUERY_PARSE_ERROR:Sr,DOC_VALIDATION:kr,BAD_REQUEST:qr,NOT_AN_OBJECT:xr,DB_MISSING:Ar,WSQ_ERROR:Or,LDB_ERROR:jr,FORBIDDEN:Cr,INVALID_REV:Ir,FILE_EXISTS:Lr,MISSING_STUB:Rr,IDB_ERROR:Tr,INVALID_URL:Dr},Br=function(e,t,n){var r=Object.keys(Nr).filter(function(n){var r=Nr[n];return"function"!=typeof r&&r[e]===t}),o=n&&r.filter(function(e){var t=Nr[e];return t.message===n})[0]||r[0];return o?Nr[o]:null};er(O,or.EventEmitter),O.prototype.cancel=function(){this.isCancelled=!0,this.db.taskqueue.isReady&&this.emit("cancel")},O.prototype.doChanges=function(e){var t=this,n=e.complete;if(e=c(e),"live"in e&&!("continuous"in e)&&(e.continuous=e.live),e.processChange=j,"latest"===e.since&&(e.since="now"),e.since||(e.since=0),"now"===e.since)return void this.db.info().then(function(r){return t.isCancelled?void n(null,{status:"cancelled"}):(e.since=r.update_seq,void t.doChanges(e))},n);if(e.continuous&&"now"!==e.since&&this.db.info().then(function(e){t.startSeq=e.update_seq},function(e){if("idbNull"!==e.id)throw e}),e.filter&&"string"==typeof e.filter&&("_view"===e.filter?e.view=w(e.view):e.filter=w(e.filter),"http"!==this.db.type()&&!e.doc_ids))return this.filterChanges(e);"descending"in e||(e.descending=!1),e.limit=0===e.limit?1:e.limit,e.complete=n;var r=this.db._changes(e);if(r&&"function"==typeof r.cancel){var o=t.cancel;t.cancel=rr(function(e){r.cancel(),o.apply(this,e)})}},O.prototype.filterChanges=function(e){var t=this,n=e.complete;if("_view"===e.filter){if(!e.view||"string"!=typeof e.view){var r=A(qr,"`view` filter parameter not found or invalid.");return n(r)}var o=b(e.view);this.db.getView(o[0],o[1],function(r,o){return t.isCancelled?n(null,{status:"cancelled"}):r?n(T(r)):o.map?(e.filter=g(o.map),void t.doChanges(e)):n(A(pr))})}else{var i=b(e.filter);if(!i)return t.doChanges(e);this.db.getFilter(i[0],i[1],function(r,o){return t.isCancelled?n(null,{status:"cancelled"}):r?n(T(r)):(e.filter=m(o),void t.doChanges(e))})}};var Mr="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split(""),Fr=N(["_id","_rev","_attachments","_deleted","_revisions","_revs_info","_conflicts","_deleted_conflicts","_local_seq","_rev_tree","_replication_id","_replication_state","_replication_state_time","_replication_state_reason","_replication_stats","_removed"]),Ur=N(["_attachments","_replication_id","_replication_state","_replication_state_time","_replication_state_reason","_replication_stats"]);er(Z,or.EventEmitter),Z.prototype.post=d("post",function(e,t,n){return"function"==typeof t&&(n=t,t={}),"object"!=typeof e||Array.isArray(e)?n(A(xr)):void this.bulkDocs({docs:[e]},t,K(n))}),Z.prototype.put=d("put",rr(function(e){var t,n,r,o,i=e.shift(),a="_id"in i;if("object"!=typeof i||Array.isArray(i))return(o=e.pop())(A(xr));for(;;)if(t=e.shift(),n=typeof t,"string"!==n||a?"string"!==n||!a||"_rev"in i?"object"===n?r=t:"function"===n&&(o=t):i._rev=t:(i._id=t,a=!0),!e.length)break;return r=r||{},B(i._id),I(i._id)&&"function"==typeof this._putLocal?i._deleted?this._removeLocal(i,o):this._putLocal(i,o):void this.bulkDocs({docs:[i]},r,K(o))})),Z.prototype.putAttachment=d("putAttachment",function(e,t,n,r,o){function i(e){var n="_rev"in e?parseInt(e._rev,10):0;return e._attachments=e._attachments||{},e._attachments[t]={content_type:o,data:r,revpos:++n},a.put(e)}var a=this;return"function"==typeof o&&(o=r,r=n,n=null),"undefined"==typeof o&&(o=r,r=n,n=null),a.get(e).then(function(e){if(e._rev!==n)throw A(vr);return i(e)},function(t){if(t.reason===pr.message)return i({_id:e});throw t})}),Z.prototype.removeAttachment=d("removeAttachment",function(e,t,n,r){var o=this;o.get(e,function(e,i){return e?void r(e):i._rev!==n?void r(A(vr)):i._attachments?(delete i._attachments[t],0===Object.keys(i._attachments).length&&delete i._attachments,void o.put(i,r)):r()})}),Z.prototype.remove=d("remove",function(e,t,n,r){var o;"string"==typeof t?(o={_id:e,_rev:t},"function"==typeof n&&(r=n,n={})):(o=e,"function"==typeof t?(r=t,n={}):(r=n,n=t)),n=n||{},n.was_delete=!0;var i={_id:o._id,_rev:o._rev||n.rev};return i._deleted=!0,I(i._id)&&"function"==typeof this._removeLocal?this._removeLocal(o,r):void this.bulkDocs({docs:[i]},n,K(r))}),Z.prototype.revsDiff=d("revsDiff",function(e,t,n){function r(e,t){s.has(e)||s.set(e,{missing:[]}),s.get(e).missing.push(t)}function o(t,n){var o=e[t].slice(0);E(n,function(e,n,i,a,s){var u=n+"-"+i,c=o.indexOf(u);-1!==c&&(o.splice(c,1),"available"!==s.status&&r(t,u))}),o.forEach(function(e){r(t,e)})}"function"==typeof t&&(n=t,t={});var i=Object.keys(e);if(!i.length)return n(null,{});var a=0,s=new nr.Map;i.map(function(t){this._getRevisionTree(t,function(r,u){if(r&&404===r.status&&"missing"===r.message)s.set(t,{missing:e[t]});else{if(r)return n(r);o(t,u)}if(++a===i.length){var c={};return s.forEach(function(e,t){c[t]=e}),n(null,c)}})},this)}),Z.prototype.bulkGet=d("bulkGet",function(e,t){C(this,e,t)}),Z.prototype.compactDocument=d("compactDocument",function(e,t,n){var r=this;this._getRevisionTree(e,function(o,i){if(o)return n(o);var a=V(i),s=[],u=[];Object.keys(a).forEach(function(e){a[e]>t&&s.push(e)}),E(i,function(e,t,n,r,o){var i=t+"-"+n;"available"===o.status&&-1!==s.indexOf(i)&&u.push(i)}),r._doCompaction(e,u,n)})}),Z.prototype.compact=d("compact",function(e,t){"function"==typeof e&&(t=e,e={});var n=this;e=e||{},n._compactionQueue=n._compactionQueue||[],n._compactionQueue.push({opts:e,callback:t}),1===n._compactionQueue.length&&X(n)}),Z.prototype._compact=function(e,t){function n(e){a.push(o.compactDocument(e.id,0))}function r(e){var n=e.last_seq;fr.all(a).then(function(){return h(o,"_local/compaction",function(e){return!e.last_seq||e.last_seq<n?(e.last_seq=n,e):!1})}).then(function(){t(null,{ok:!0})})["catch"](t)}var o=this,i={return_docs:!1,last_seq:e.last_seq||0},a=[];o.changes(i).on("change",n).on("complete",r).on("error",t)},Z.prototype.get=d("get",function(e,t,n){function r(){var r=[],a=o.length;return a?void o.forEach(function(o){i.get(e,{rev:o,revs:t.revs,attachments:t.attachments},function(e,t){e?r.push({missing:o}):r.push({ok:t}),a--,a||n(null,r)})}):n(null,r)}if("function"==typeof t&&(n=t,t={}),"string"!=typeof e)return n(A(yr));if(I(e)&&"function"==typeof this._getLocal)return this._getLocal(e,n);var o=[],i=this;if(!t.open_revs)return this._get(e,t,function(e,r){if(e)return n(e);var o=r.doc,a=r.metadata,s=r.ctx;if(t.conflicts){var u=q(a);u.length&&(o._conflicts=u)}if(_(a,o._rev)&&(o._deleted=!0),t.revs||t.revs_info){var c=L(a.rev_tree),f=H(c,function(e){return-1!==e.ids.map(function(e){return e.id}).indexOf(o._rev.split("-")[1])}),l=f.ids.map(function(e){return e.id}).indexOf(o._rev.split("-")[1])+1,d=f.ids.length-l;if(f.ids.splice(l,d),f.ids.reverse(),t.revs&&(o._revisions={start:f.pos+f.ids.length-1,ids:f.ids.map(function(e){return e.id})}),t.revs_info){var h=f.pos+f.ids.length;o._revs_info=f.ids.map(function(e){return h--,{rev:h+"-"+e.id,status:e.opts.status}})}}if(t.attachments&&o._attachments){var p=o._attachments,v=Object.keys(p).length;if(0===v)return n(null,o);Object.keys(p).forEach(function(e){this._getAttachment(p[e],{binary:t.binary,ctx:s},function(t,r){var i=o._attachments[e];i.data=r,delete i.stub,delete i.length,--v||n(null,o)})},i)}else{if(o._attachments)for(var y in o._attachments)o._attachments.hasOwnProperty(y)&&(o._attachments[y].stub=!0);n(null,o)}});if("all"===t.open_revs)this._getRevisionTree(e,function(e,t){return e?n(e):(o=k(t).map(function(e){return e.rev}),void r())});else{if(!Array.isArray(t.open_revs))return n(A(br,"function_clause"));o=t.open_revs;for(var a=0;a<o.length;a++){var s=o[a];if("string"!=typeof s||!/^\d+-/.test(s))return n(A(Ir))}r()}}),Z.prototype.getView=d("getView",function(e,t,n){Y(this,e,"views",t,n)}),Z.prototype.getFilter=d("getFilter",function(e,t,n){Y(this,e,"filters",t,n)}),Z.prototype.getAttachment=d("getAttachment",function(e,t,n,r){var o=this;n instanceof Function&&(r=n,n={}),this._get(e,n,function(e,i){return e?r(e):i.doc._attachments&&i.doc._attachments[t]?(n.ctx=i.ctx,n.binary=!0,o._getAttachment(i.doc._attachments[t],n,r),void 0):r(A(pr))})}),Z.prototype.allDocs=d("allDocs",function(e,t){if("function"==typeof e&&(t=e,e={}),e.skip="undefined"!=typeof e.skip?e.skip:0,e.start_key&&(e.startkey=e.start_key),e.end_key&&(e.endkey=e.end_key),
"keys"in e){if(!Array.isArray(e.keys))return t(new TypeError("options.keys must be an array"));var n=["startkey","endkey","key"].filter(function(t){return t in e})[0];if(n)return void t(A(Sr,"Query parameter `"+n+"` is not compatible with multi-get"));if("http"!==this.type())return G(this,e,t)}return this._allDocs(e,t)}),Z.prototype.changes=function(e,t){return"function"==typeof e&&(t=e,e={}),new O(this,e,t)},Z.prototype.close=d("close",function(e){return this._closed=!0,this._close(e)}),Z.prototype.info=d("info",function(e){var t=this;this._info(function(n,r){return n?e(n):(r.db_name=r.db_name||t._db_name,r.auto_compaction=!(!t.auto_compaction||"http"===t.type()),r.adapter=t.type(),void e(null,r))})}),Z.prototype.id=d("id",function(e){return this._id(e)}),Z.prototype.type=function(){return"function"==typeof this._type?this._type():this.adapter},Z.prototype.bulkDocs=d("bulkDocs",function(e,t,n){if("function"==typeof t&&(n=t,t={}),t=t||{},Array.isArray(e)&&(e={docs:e}),!e||!e.docs||!Array.isArray(e.docs))return n(A(hr));for(var r=0;r<e.docs.length;++r)if("object"!=typeof e.docs[r]||Array.isArray(e.docs[r]))return n(A(xr));var o;return e.docs.forEach(function(e){e._attachments&&Object.keys(e._attachments).forEach(function(e){o=o||z(e)})}),o?n(A(qr,o)):("new_edits"in t||("new_edits"in e?t.new_edits=e.new_edits:t.new_edits=!0),t.new_edits||"http"===this.type()||e.docs.sort(J),W(e.docs),this._bulkDocs(e,t,function(e,r){return e?n(e):(t.new_edits||(r=r.filter(function(e){return e.error})),void n(null,r))}))}),Z.prototype.registerDependentDatabase=d("registerDependentDatabase",function(e,t){function n(t){return t.dependentDbs=t.dependentDbs||{},t.dependentDbs[e]?!1:(t.dependentDbs[e]=!0,t)}var r=new this.constructor(e,this.__opts);h(this,"_local/_pouch_dependentDbs",n).then(function(){t(null,{db:r})})["catch"](t)}),Z.prototype.destroy=d("destroy",function(e,t){function n(){r._destroy(e,function(e,n){return e?t(e):(r._destroyed=!0,r.emit("destroyed"),void t(null,n||{ok:!0}))})}"function"==typeof e&&(t=e,e={});var r=this,o="use_prefix"in r?r.use_prefix:!0;return"http"===r.type()?n():void r.get("_local/_pouch_dependentDbs",function(e,i){if(e)return 404!==e.status?t(e):n();var a=i.dependentDbs,s=r.constructor,u=Object.keys(a).map(function(e){var t=o?e.replace(new RegExp("^"+s.prefix),""):e;return new s(t,r.__opts).destroy()});fr.all(u).then(n,t)})}),ee.prototype.execute=function(){var e;if(this.failed)for(;e=this.queue.shift();)e(this.failed);else for(;e=this.queue.shift();)e()},ee.prototype.fail=function(e){this.failed=e,this.execute()},ee.prototype.ready=function(e){this.isReady=!0,this.db=e,this.execute()},ee.prototype.addTask=function(e){this.queue.push(e),this.failed&&this.execute()},er(re,Z),re.debug=Zn;var Pr;if(oe())Pr=!1;else try{localStorage.setItem("_pouch_check_localstorage",1),Pr=!!localStorage.getItem("_pouch_check_localstorage")}catch(Hr){Pr=!1}re.adapters={},re.preferredAdapters=[],re.prefix="_pouch_";var Kr=new or.EventEmitter;ae(re),re.parseAdapter=function(e,t){var n,r,o=e.match(/([a-z\-]*):\/\/(.*)/);if(o){if(e=/http(s?)/.test(o[1])?o[1]+"://"+o[2]:o[2],n=o[1],!re.adapters[n].valid())throw"Invalid adapter";return{name:e,adapter:o[1]}}var i="idb"in re.adapters&&"websql"in re.adapters&&ie()&&localStorage["_pouch__websqldb_"+re.prefix+e];if(t.adapter)r=t.adapter;else if("undefined"!=typeof t&&t.db)r="leveldb";else for(var a=0;a<re.preferredAdapters.length;++a)if(r=re.preferredAdapters[a],r in re.adapters){if(i&&"idb"===r){console.log('PouchDB is downgrading "'+e+'" to WebSQL to avoid data loss, because it was already opened with WebSQL.');continue}break}n=re.adapters[r];var s=n&&"use_prefix"in n?n.use_prefix:!0;return{name:s?re.prefix+e:e,adapter:r}},re.adapter=function(e,t,n){t.valid()&&(re.adapters[e]=t,n&&re.preferredAdapters.push(e))},re.plugin=function(e){return Object.keys(e).forEach(function(t){re.prototype[t]=e[t]}),re},re.defaults=function(e){function t(n,r,o){return this instanceof t?("function"!=typeof r&&"undefined"!=typeof r||(o=r,r={}),n&&"object"==typeof n&&(r=n,n=void 0),r=$n.extend({},e,r),void re.call(this,n,r,o)):new t(n,r,o)}return er(t,re),ae(t),t.preferredAdapters=re.preferredAdapters.slice(),Object.keys(re).forEach(function(e){e in t||(t[e]=re[e])}),t};var Wr=de(),Jr=function(){},Vr=["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],Gr="queryKey",Xr=/(?:^|&)([^&=]*)=?([^&]*)/g,zr=/^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/,Qr=function(e){return atob(e)},$r=function(e){return btoa(e)},Yr=Yn.extend,Zr={ajax:ye,parseUri:_e,uuid:D,Promise:fr,atob:Qr,btoa:$r,binaryStringToBlobOrBuffer:ge,clone:c,extend:Yr,createError:A},eo=sr.collate,to=1,no="pouchdb",ro=5,oo=0;ke.prototype.writeCheckpoint=function(e,t){var n=this;return this.updateTarget(e,t).then(function(){return n.updateSource(e,t)})},ke.prototype.updateTarget=function(e,t){return Se(this.target,this.id,e,t,this.returnValue)},ke.prototype.updateSource=function(e,t){var n=this;return this.readOnlySource?fr.resolve(!0):Se(this.src,this.id,e,t,this.returnValue)["catch"](function(e){if(Te(e))return n.readOnlySource=!0,!0;throw e})};var io={undefined:function(e,t){return 0===eo(e.last_seq,t.last_seq)?t.last_seq:0},1:function(e,t){return qe(t,e).last_seq}};ke.prototype.getCheckpoint=function(){var e=this;return e.target.get(e.id).then(function(t){return e.readOnlySource?fr.resolve(t.last_seq):e.src.get(e.id).then(function(e){if(t.version!==e.version)return oo;var n;return n=t.version?t.version.toString():"undefined",n in io?io[n](t,e):oo},function(n){if(404===n.status&&t.last_seq)return e.src.put({_id:e.id,last_seq:oo}).then(function(){return oo},function(n){return Te(n)?(e.readOnlySource=!0,t.last_seq):oo});throw n})})["catch"](function(e){if(404!==e.status)throw e;return oo})};var ao=0,so=r.setImmediate||r.setTimeout,uo=32768,co=l(function(e,t){function n(){var r=s*i,o=r+i;if(s++,a>s)c(u,e,r,o),so(n);else{c(u,e,r,o);var f=u.end(!0),l=Ie(f);t(null,l),u.destroy()}}var r="string"==typeof e,o=r?e.length:e.byteLength,i=Math.min(uo,o),a=Math.ceil(o/i),s=0,u=r?new ur:new ur.ArrayBuffer,c=r?Re:Le;n()});er(Pe,or.EventEmitter),Pe.prototype.cancel=function(){this.cancelled=!0,this.state="cancelled",this.emit("cancel")},Pe.prototype.ready=function(e,t){function n(){o.cancel()}function r(){e.removeListener("destroyed",n),t.removeListener("destroyed",n)}var o=this;o._readyCalled||(o._readyCalled=!0,e.once("destroyed",n),t.once("destroyed",n),o.once("complete",r))};var fo={replicate:Ke,toPouch:He},lo=fo.replicate;er(Je,or.EventEmitter),Je.prototype.cancel=function(){this.canceled||(this.canceled=!0,this.push.cancel(),this.pull.cancel())};var ho=25,po=50,vo={},yo=1800,_o=Zn("pouchdb:http");ot.valid=function(){return!0},it.prototype.add=function(e){return this.promise=this.promise["catch"](function(){}).then(function(){return e()}),this.promise},it.prototype.finish=function(){return this.promise};var mo,go=function(e,t){return t&&e.then(function(e){n.nextTick(function(){t(null,e)})},function(e){n.nextTick(function(){t(e)})}),e},bo=function(e){return rr(function(t){var n=t.pop(),r=e.apply(this,t);return"function"==typeof n&&go(r,n),r})},wo=function(e,t){return e.then(function(e){return t().then(function(){return e})},function(e){return t().then(function(){throw e})})},Eo=function(e,t){return function(){var n=arguments,r=this;return e.add(function(){return t.apply(r,n)})}},So=function(e){for(var t={},n=0,r=e.length;r>n;n++)t["$"+e[n]]=!0;var o=Object.keys(t),i=new Array(o.length);for(n=0,r=o.length;r>n;n++)i[n]=o[n].substring(1);return i},ko={uniq:So,sequentialize:Eo,fin:wo,callbackify:bo,promisedCallback:go},qo=sr.collate,xo=sr.toIndexableString,Ao=sr.normalizeKey,To=sr.parseIndexableString;mo="undefined"!=typeof console&&"function"==typeof console.log?Function.prototype.bind.call(console.log,console):function(){};var Oo=ko.callbackify,jo=ko.sequentialize,Co=ko.uniq,Io=ko.fin,Lo=ko.promisedCallback,Ro={},Do=new it,No=50,Bo={_sum:function(e,t){return gt(t)},_count:function(e,t){return t.length},_stats:function(e,t){function n(e){for(var t=0,n=0,r=e.length;r>n;n++){var o=e[n];t+=o*o}return t}return{sum:gt(t),min:Math.min.apply(null,t),max:Math.max.apply(null,t),count:t.length,sumsqr:n(t)}}},Mo=Oo(function(){var e=this;return e._ddocCache&&delete e._ddocCache,"http"===e.type()?Bt(e):"function"==typeof e._viewCleanup?At(e):Mt(e)}),Fo=function(e,t,n){"function"==typeof t&&(n=t,t={}),t=t?Et(t):{},"function"==typeof e&&(e={map:e});var r=this,o=fr.resolve().then(function(){return Ft(r,e,t)});return Lo(o,n),o};er(Ut,Error),er(Pt,Error);var Uo={query:Fo,viewCleanup:Mo},Po=5,Ho="document-store",Ko="by-sequence",Wo="attach-store",Jo="attach-seq-store",Vo="meta-store",Go="local-store",Xo="detect-blob-support",zo={running:!1,queue:[]};er(qn,or.EventEmitter),qn.prototype.addListener=function(e,t,n,r){function o(){function e(){s=!1}if(a._listeners[t]){if(s)return void(s="waiting");s=!0;var u=i(r,["style","include_docs","attachments","conflicts","filter","doc_ids","view","since","query_params","binary"]);n.changes(u).on("change",function(e){e.seq>r.since&&!r.cancelled&&(r.since=e.seq,r.onChange(e))}).on("complete",function(){"waiting"===s&&setTimeout(function(){o()},0),s=!1}).on("error",e)}}if(!this._listeners[t]){var a=this,s=!1;this._listeners[t]=o,this.on(e,o)}},qn.prototype.removeListener=function(e,t){t in this._listeners&&or.EventEmitter.prototype.removeListener.call(this,e,this._listeners[t])},qn.prototype.notifyLocalWindows=function(e){oe()?chrome.storage.local.set({dbName:e}):ie()&&(localStorage[e]="a"===localStorage[e]?"b":"a")},qn.prototype.notify=function(e){this.emit(e),this.notifyLocalWindows(e)};var Qo,$o=new nr.Map,Yo=new qn,Zo=new nr.Map;xn.valid=function(){var e="undefined"!=typeof openDatabase&&/(Safari|iPhone|iPad|iPod)/.test(navigator.userAgent)&&!/Chrome/.test(navigator.userAgent)&&!/BlackBerry/.test(navigator.platform);return!e&&"undefined"!=typeof indexedDB&&"undefined"!=typeof IDBKeyRange};var ei=7,ti=Rn("document-store"),ni=Rn("by-sequence"),ri=Rn("attach-store"),oi=Rn("local-store"),ii=Rn("metadata-store"),ai=Rn("attach-seq-store"),si=new nr.Map,ui=new qn,ci=1,fi="CREATE INDEX IF NOT EXISTS 'by-seq-deleted-idx' ON "+ni+" (seq, deleted)",li="CREATE UNIQUE INDEX IF NOT EXISTS 'by-seq-doc-id-rev' ON "+ni+" (doc_id, rev)",di="CREATE INDEX IF NOT EXISTS 'doc-winningseq-idx' ON "+ti+" (winningseq)",hi="CREATE INDEX IF NOT EXISTS 'attach-seq-seq-idx' ON "+ai+" (seq)",pi="CREATE UNIQUE INDEX IF NOT EXISTS 'attach-seq-digest-idx' ON "+ai+" (digest, seq)",vi=ni+".seq = "+ti+".winningseq",yi=ni+".seq AS seq, "+ni+".deleted AS deleted, "+ni+".json AS data, "+ni+".rev AS rev, "+ti+".json AS metadata";Qn.use_prefix=!("undefined"!=typeof n&&!n.browser),Qn.valid=Nn;var _i={idb:xn,websql:Qn};re.ajax=ye,re.utils=Zr,re.Errors=Nr,re.replicate=fo.replicate,re.sync=We,re.version="5.3.2",re.adapter("http",ot),re.adapter("https",ot),re.plugin(Uo),Object.keys(_i).forEach(function(e){re.adapter(e,_i[e],!0)}),t.exports=re}).call(this,e(13),"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{1:1,10:10,12:12,13:13,14:14,15:15,16:16,2:2,4:4,6:6,7:7,8:8}]},{},[17])(17)});

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__("../../../../webpack/buildin/global.js")))

/***/ }),

/***/ "../../../../../src/$$_gendir lazy recursive":
/***/ (function(module, exports) {

function webpackEmptyAsyncContext(req) {
	return new Promise(function(resolve, reject) { reject(new Error("Cannot find module '" + req + "'.")); });
}
webpackEmptyAsyncContext.keys = function() { return []; };
webpackEmptyAsyncContext.resolve = webpackEmptyAsyncContext;
module.exports = webpackEmptyAsyncContext;
webpackEmptyAsyncContext.id = "../../../../../src/$$_gendir lazy recursive";

/***/ }),

/***/ "../../../../../src/app/actions/contact.actions.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return ContactActions; });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var ContactActions = ContactActions_1 = (function () {
    function ContactActions() {
    }
    ContactActions.prototype.resetBlankContact = function () {
        return {
            type: ContactActions_1.RESET_BLANK_CONTACT
        };
    };
    ContactActions.prototype.loadContacts = function () {
        return {
            type: ContactActions_1.LOAD_CONTACTS
        };
    };
    ContactActions.prototype.loadContactsSuccess = function (contacts) {
        return {
            type: ContactActions_1.LOAD_CONTACTS_SUCCESS,
            payload: contacts
        };
    };
    ContactActions.prototype.getContact = function (id) {
        return {
            type: ContactActions_1.GET_CONTACT,
            payload: id
        };
    };
    ContactActions.prototype.getContactSuccess = function (contact) {
        return {
            type: ContactActions_1.GET_CONTACT_SUCCESS,
            payload: contact
        };
    };
    ContactActions.prototype.saveContact = function (contact) {
        return {
            type: ContactActions_1.SAVE_CONTACT,
            payload: contact
        };
    };
    ContactActions.prototype.saveContactSuccess = function (contact) {
        return {
            type: ContactActions_1.SAVE_CONTACT_SUCCESS,
            payload: contact
        };
    };
    ContactActions.prototype.deleteContact = function (contact) {
        return {
            type: ContactActions_1.DELETE_CONTACT,
            payload: contact
        };
    };
    ContactActions.prototype.deleteContactSuccess = function (contact) {
        return {
            type: ContactActions_1.DELETE_CONTACT_SUCCESS,
            payload: contact
        };
    };
    return ContactActions;
}());
ContactActions.RESET_BLANK_CONTACT = '[Contact] Reset Blank Contact';
ContactActions.LOAD_CONTACTS = '[Contact] Load Contacts';
ContactActions.LOAD_CONTACTS_SUCCESS = '[Contact] Load Contacts Success';
ContactActions.GET_CONTACT = '[Contact] Get Contact';
ContactActions.GET_CONTACT_SUCCESS = '[Contact] Get Contact Success';
ContactActions.SAVE_CONTACT = '[Contact] Save Contact';
ContactActions.SAVE_CONTACT_SUCCESS = '[Contact] Save Contact Success';
ContactActions.DELETE_CONTACT = '[Contact] Delete Contact';
ContactActions.DELETE_CONTACT_SUCCESS = '[Contact] Delete Contact Success';
ContactActions = ContactActions_1 = __decorate([
    Object(__WEBPACK_IMPORTED_MODULE_0__angular_core__["Injectable"])()
], ContactActions);

var ContactActions_1;
//# sourceMappingURL=contact.actions.js.map

/***/ }),

/***/ "../../../../../src/app/app-routing.module.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return AppRoutingModule; });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1__angular_router__ = __webpack_require__("../../../router/@angular/router.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2__contact_details_contact_details_component__ = __webpack_require__("../../../../../src/app/contact-details/contact-details.component.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3__contact_list_contact_list_component__ = __webpack_require__("../../../../../src/app/contact-list/contact-list.component.ts");
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};




var routes = [
    { path: '', redirectTo: '/list', pathMatch: 'full' },
    { path: 'list', component: __WEBPACK_IMPORTED_MODULE_3__contact_list_contact_list_component__["a" /* ContactListComponent */] },
    { path: 'edit', component: __WEBPACK_IMPORTED_MODULE_2__contact_details_contact_details_component__["a" /* ContactDetailsComponent */] },
    { path: 'edit/:id', component: __WEBPACK_IMPORTED_MODULE_2__contact_details_contact_details_component__["a" /* ContactDetailsComponent */] }
];
var AppRoutingModule = (function () {
    function AppRoutingModule() {
    }
    return AppRoutingModule;
}());
AppRoutingModule = __decorate([
    Object(__WEBPACK_IMPORTED_MODULE_0__angular_core__["NgModule"])({
        imports: [__WEBPACK_IMPORTED_MODULE_1__angular_router__["c" /* RouterModule */].forRoot(routes)],
        exports: [__WEBPACK_IMPORTED_MODULE_1__angular_router__["c" /* RouterModule */]]
    })
], AppRoutingModule);

//# sourceMappingURL=app-routing.module.js.map

/***/ }),

/***/ "../../../../../src/app/app.component.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return AppComponent; });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

var AppComponent = (function () {
    function AppComponent() {
    }
    return AppComponent;
}());
AppComponent = __decorate([
    Object(__WEBPACK_IMPORTED_MODULE_0__angular_core__["Component"])({
        selector: 'app-root',
        template: '<router-outlet></router-outlet>',
        providers: []
    }),
    __metadata("design:paramtypes", [])
], AppComponent);

//# sourceMappingURL=app.component.js.map

/***/ }),

/***/ "../../../../../src/app/app.module.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return AppModule; });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_platform_browser__ = __webpack_require__("../../../platform-browser/@angular/platform-browser.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2__ngrx_store__ = __webpack_require__("../../../../@ngrx/store/@ngrx/store.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3__ngrx_effects__ = __webpack_require__("../../../../@ngrx/effects/@ngrx/effects.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_4__angular_forms__ = __webpack_require__("../../../forms/@angular/forms.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_5_ng_block_ui__ = __webpack_require__("../../../../ng-block-ui/dist/index.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_5_ng_block_ui___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_5_ng_block_ui__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_6__app_component__ = __webpack_require__("../../../../../src/app/app.component.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_7__contact_details_contact_details_component__ = __webpack_require__("../../../../../src/app/contact-details/contact-details.component.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_8__contact_list_contact_list_component__ = __webpack_require__("../../../../../src/app/contact-list/contact-list.component.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_9__app_routing_module__ = __webpack_require__("../../../../../src/app/app-routing.module.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_10__services_dal_service__ = __webpack_require__("../../../../../src/app/services/dal.service.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_11__actions_contact_actions__ = __webpack_require__("../../../../../src/app/actions/contact.actions.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_12__effects_contact_effects__ = __webpack_require__("../../../../../src/app/effects/contact.effects.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_13__reducers_contact_list_reducer__ = __webpack_require__("../../../../../src/app/reducers/contact-list.reducer.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_14__reducers_contact_reducer__ = __webpack_require__("../../../../../src/app/reducers/contact.reducer.ts");
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};















var AppModule = (function () {
    function AppModule() {
    }
    return AppModule;
}());
AppModule = __decorate([
    Object(__WEBPACK_IMPORTED_MODULE_1__angular_core__["NgModule"])({
        declarations: [
            __WEBPACK_IMPORTED_MODULE_6__app_component__["a" /* AppComponent */],
            __WEBPACK_IMPORTED_MODULE_7__contact_details_contact_details_component__["a" /* ContactDetailsComponent */],
            __WEBPACK_IMPORTED_MODULE_8__contact_list_contact_list_component__["a" /* ContactListComponent */]
        ],
        imports: [
            __WEBPACK_IMPORTED_MODULE_0__angular_platform_browser__["a" /* BrowserModule */],
            __WEBPACK_IMPORTED_MODULE_4__angular_forms__["a" /* FormsModule */],
            __WEBPACK_IMPORTED_MODULE_5_ng_block_ui__["BlockUIModule"],
            __WEBPACK_IMPORTED_MODULE_9__app_routing_module__["a" /* AppRoutingModule */],
            __WEBPACK_IMPORTED_MODULE_2__ngrx_store__["c" /* StoreModule */].forRoot({
                contact: __WEBPACK_IMPORTED_MODULE_14__reducers_contact_reducer__["a" /* ContactReducer */],
                contactList: __WEBPACK_IMPORTED_MODULE_13__reducers_contact_list_reducer__["a" /* ContactListReducer */],
            }),
            __WEBPACK_IMPORTED_MODULE_3__ngrx_effects__["c" /* EffectsModule */].forRoot([
                __WEBPACK_IMPORTED_MODULE_12__effects_contact_effects__["a" /* ContactEffects */],
            ])
        ],
        providers: [
            __WEBPACK_IMPORTED_MODULE_10__services_dal_service__["a" /* DalService */],
            __WEBPACK_IMPORTED_MODULE_11__actions_contact_actions__["a" /* ContactActions */]
        ],
        bootstrap: [__WEBPACK_IMPORTED_MODULE_6__app_component__["a" /* AppComponent */]]
    })
], AppModule);

//# sourceMappingURL=app.module.js.map

/***/ }),

/***/ "../../../../../src/app/contact-details/contact-details.component.html":
/***/ (function(module, exports) {

module.exports = "<block-ui>\n    <div class=\"row\">\n        <div class=\"col-md-6 col-md-offset-3 container\">\n            <div class=\"panel panel-default panel-info\">\n                <div class=\"panel-heading\">Edit person</div>\n                <div class=\"panel-body\">\n                    <form novalidate role=\"form\" #form=\"ngForm\" (ngSubmit)=\"save(form, myFriend)\">\n                        <div class=\"form-group\">\n                            <label>Full name</label>\n                            <input type=\"text\" name=\"name\" required class=\"form-control\" placeholder=\"Enter full name\" [(ngModel)]=\"myFriend.name\" #name=\"ngModel\" />\n                            <span class=\"label label-danger\" *ngIf=\"name.invalid && (name.dirty || name.touched)\">You must enter the name</span>\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Phone number</label>\n                            <input type=\"text\" name=\"phone\" class=\"form-control\" placeholder=\"Enter phone number\" [(ngModel)]=\"myFriend.phone\" />\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Address</label>\n                            <input type=\"text\" name=\"address\" class=\"form-control\" placeholder=\"Enter address\" [(ngModel)]=\"myFriend.address\" />\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Email</label>\n                            <input type=\"text\" name=\"email\" class=\"form-control\" placeholder=\"Enter email\" [(ngModel)]=\"myFriend.email\" />\n                        </div>\n                        <div class=\"checkbox\">\n                            <label>\n                                <input type=\"checkbox\" name=\"relative\" [(ngModel)]=\"myFriend.relative\" id=\"edition_relative\" />\n                                Relative\n                            </label>\n                        </div>\n\n                        <div class=\"row\">\n                            <div class=\"col-md-4 text-center\">\n                                <a class=\"btn btn-default\" [routerLink]=\"['/list']\">Cancel</a>\n                            </div>\n                            <div class=\"col-md-4 text-center\">\n                                <input type=\"button\" class=\"btn btn-default\" (click)=\"delete(myFriend)\" *ngIf=\"myFriend._id != null\" value=\"Delete\"/>\n                            </div>\n                            <div class=\"col-md-4 text-center\">\n                                <input type=\"submit\" class=\"btn btn-default\" value=\"Save\" [disabled]=\"form.invalid\"/>\n                            </div>\n                        </div>\n                    </form>\n                </div> \n            </div> \n        </div> \n    </div>\n</block-ui>"

/***/ }),

/***/ "../../../../../src/app/contact-details/contact-details.component.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return ContactDetailsComponent; });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1__angular_router__ = __webpack_require__("../../../router/@angular/router.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2__angular_common__ = __webpack_require__("../../../common/@angular/common.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3__ngrx_store__ = __webpack_require__("../../../../@ngrx/store/@ngrx/store.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_4_rxjs_add_operator_switchMap__ = __webpack_require__("../../../../rxjs/add/operator/switchMap.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_4_rxjs_add_operator_switchMap___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_4_rxjs_add_operator_switchMap__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_5_ng_block_ui__ = __webpack_require__("../../../../ng-block-ui/dist/index.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_5_ng_block_ui___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_5_ng_block_ui__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_6__actions_contact_actions__ = __webpack_require__("../../../../../src/app/actions/contact.actions.ts");
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};







var ContactDetailsComponent = (function () {
    function ContactDetailsComponent(store, contactActions, route, router, location) {
        this.store = store;
        this.contactActions = contactActions;
        this.route = route;
        this.router = router;
        this.location = location;
    }
    ContactDetailsComponent.prototype.ngOnInit = function () {
        var _this = this;
        // Subscribe for changes on the user state.
        var contactObservable = this.store.select('contact');
        this.contactSubscription = contactObservable.subscribe(function (next) {
            _this.myFriend = next.contact;
            if (next.loading || next.saving) {
                if (next.loading) {
                    _this.blockUI.start("Loading...");
                }
                else {
                    _this.blockUI.start("Saving...");
                }
            }
            else {
                _this.blockUI.stop();
            }
        });
        // Load the user according to the id parameter.
        this.route.params.subscribe(function (params) {
            if (params.id) {
                _this.store.dispatch(_this.contactActions.getContact(params.id));
            }
            else {
                _this.store.dispatch(_this.contactActions.resetBlankContact());
            }
        });
    };
    ContactDetailsComponent.prototype.ngOnDestroy = function () {
        this.contactSubscription.unsubscribe();
    };
    ContactDetailsComponent.prototype.save = function (form, contact) {
        // Verify that the form is valid.
        if (!form.invalid) {
            this.store.dispatch(this.contactActions.saveContact(contact));
        }
    };
    ContactDetailsComponent.prototype.delete = function (contact) {
        // Ask for confirmation.
        if (confirm("Are you sure that you want to delete this contact?")) {
            this.store.dispatch(this.contactActions.deleteContact(contact));
            this.router.navigateByUrl('/list');
        }
    };
    return ContactDetailsComponent;
}());
__decorate([
    Object(__WEBPACK_IMPORTED_MODULE_5_ng_block_ui__["BlockUI"])(),
    __metadata("design:type", typeof (_a = typeof __WEBPACK_IMPORTED_MODULE_5_ng_block_ui__["NgBlockUI"] !== "undefined" && __WEBPACK_IMPORTED_MODULE_5_ng_block_ui__["NgBlockUI"]) === "function" && _a || Object)
], ContactDetailsComponent.prototype, "blockUI", void 0);
ContactDetailsComponent = __decorate([
    Object(__WEBPACK_IMPORTED_MODULE_0__angular_core__["Component"])({
        selector: 'contact-details',
        template: __webpack_require__("../../../../../src/app/contact-details/contact-details.component.html")
    }),
    __metadata("design:paramtypes", [typeof (_b = typeof __WEBPACK_IMPORTED_MODULE_3__ngrx_store__["b" /* Store */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_3__ngrx_store__["b" /* Store */]) === "function" && _b || Object, typeof (_c = typeof __WEBPACK_IMPORTED_MODULE_6__actions_contact_actions__["a" /* ContactActions */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_6__actions_contact_actions__["a" /* ContactActions */]) === "function" && _c || Object, typeof (_d = typeof __WEBPACK_IMPORTED_MODULE_1__angular_router__["a" /* ActivatedRoute */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_1__angular_router__["a" /* ActivatedRoute */]) === "function" && _d || Object, typeof (_e = typeof __WEBPACK_IMPORTED_MODULE_1__angular_router__["b" /* Router */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_1__angular_router__["b" /* Router */]) === "function" && _e || Object, typeof (_f = typeof __WEBPACK_IMPORTED_MODULE_2__angular_common__["Location"] !== "undefined" && __WEBPACK_IMPORTED_MODULE_2__angular_common__["Location"]) === "function" && _f || Object])
], ContactDetailsComponent);

var _a, _b, _c, _d, _e, _f;
//# sourceMappingURL=contact-details.component.js.map

/***/ }),

/***/ "../../../../../src/app/contact-list/contact-list.component.html":
/***/ (function(module, exports) {

module.exports = "<block-ui>\n    <div>\n        <div class=\"panel panel-success\">\n            <div class=\"panel-heading\">List of contacts</div>\n            <table class=\"table table-striped table-bordered text-center\">\n                 <thead>\n                    <tr>\n                       <th>Name</th>\n                       <th>Phone</th>\n                       <th>Address</th>\n                       <th>E-mail</th>\n                       <th>Relative</th>\n                       <th></th>\n                    </tr>\n                </thead>\n                <tbody>\n                    <tr *ngFor=\"let friend of friends\">\n                        <td>{{friend.name}}</td>\n                        <td>{{friend.phone}}</td>\n                        <td>{{friend.email}}</td>\n                        <td>{{friend.address}}</td> \n                        <td>\n                            <span class=\"glyphicon glyphicon-ok\" aria-hidden=\"true\" *ngIf=\"friend.relative\"></span>\n                            <span class=\"glyphicon glyphicon-remove\" aria-hidden=\"true\" *ngIf=\"!friend.relative\"></span>\n                        </td>\n                        <td>\n                            <a class=\"btn btn-default\" [routerLink]=\"['/edit', friend._id]\">Edit</a>\n                        </td>\n                    </tr>\n                </tbody>\n            </table>\n        </div>\n\n        <div class=\"text-right\">    \n            <button type=\"submit\" class=\"btn btn-default\" (click)=\"download()\" id=\"list_btn_download\" aria-hidden=\"true\" *ngIf=\"friends && friends.length > 0\">\n                <span class=\"glyphicon glyphicon-download\"></span>\n                Download CSV\n            </button>\n            <a class=\"btn btn-default\" [routerLink]=\"['/edit']\">\n                <span class=\"glyphicon glyphicon-plus\"></span>\n                New contact\n            </a>\n        </div>\n    </div>\n</block-ui>"

/***/ }),

/***/ "../../../../../src/app/contact-list/contact-list.component.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return ContactListComponent; });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1__ngrx_store__ = __webpack_require__("../../../../@ngrx/store/@ngrx/store.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2_ng_block_ui__ = __webpack_require__("../../../../ng-block-ui/dist/index.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2_ng_block_ui___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_2_ng_block_ui__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3__lib_FileSaver__ = __webpack_require__("../../../../../lib/FileSaver.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3__lib_FileSaver___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_3__lib_FileSaver__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_4__actions_contact_actions__ = __webpack_require__("../../../../../src/app/actions/contact.actions.ts");
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};





var ContactListComponent = (function () {
    function ContactListComponent(store, contactActions) {
        this.store = store;
        this.contactActions = contactActions;
    }
    ContactListComponent.prototype.ngOnInit = function () {
        var _this = this;
        // Subscribe for changes on the contact list state.
        var contactListObservable = this.store.select('contactList');
        this.contactListSubscription = contactListObservable.subscribe(function (next) {
            _this.friends = next.list;
            if (next.loading) {
                _this.blockUI.start('Loading...');
            }
            else {
                _this.blockUI.stop();
            }
        });
        // Load contacts.
        this.store.dispatch(this.contactActions.loadContacts());
    };
    ContactListComponent.prototype.ngOnDestroy = function () {
        this.contactListSubscription.unsubscribe();
    };
    ContactListComponent.prototype.download = function () {
        // Generate CSV data.
        var csv = '"Name","Phone","Address","Email","Relative"\n';
        for (var i = 0; i < this.friends.length; i++) {
            csv += toCsvField(this.friends[i].name) + ',';
            csv += toCsvField(this.friends[i].phone) + ',';
            csv += toCsvField(this.friends[i].address) + ',';
            csv += toCsvField(this.friends[i].email) + ',';
            csv += toCsvField(this.friends[i].relative) + '\n';
        }
        // Generate CSV file.
        var blob = new Blob([csv], { type: "text/plain;charset=utf-8" });
        __WEBPACK_IMPORTED_MODULE_3__lib_FileSaver__(blob, "address_book.csv");
    };
    return ContactListComponent;
}());
__decorate([
    Object(__WEBPACK_IMPORTED_MODULE_2_ng_block_ui__["BlockUI"])(),
    __metadata("design:type", typeof (_a = typeof __WEBPACK_IMPORTED_MODULE_2_ng_block_ui__["NgBlockUI"] !== "undefined" && __WEBPACK_IMPORTED_MODULE_2_ng_block_ui__["NgBlockUI"]) === "function" && _a || Object)
], ContactListComponent.prototype, "blockUI", void 0);
ContactListComponent = __decorate([
    Object(__WEBPACK_IMPORTED_MODULE_0__angular_core__["Component"])({
        selector: 'contact-list',
        template: __webpack_require__("../../../../../src/app/contact-list/contact-list.component.html")
    }),
    __metadata("design:paramtypes", [typeof (_b = typeof __WEBPACK_IMPORTED_MODULE_1__ngrx_store__["b" /* Store */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_1__ngrx_store__["b" /* Store */]) === "function" && _b || Object, typeof (_c = typeof __WEBPACK_IMPORTED_MODULE_4__actions_contact_actions__["a" /* ContactActions */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_4__actions_contact_actions__["a" /* ContactActions */]) === "function" && _c || Object])
], ContactListComponent);

/**
 * Converts a value into an string suitable to be used as a field in a CSV file.
 *
 * @param {mixed} value A value.
 * @returns {String} An string to be used in a CSV file.
 */
function toCsvField(value) {
    // Cast to string.
    var res = value !== null && value !== undefined ? value.toString() : '';
    // Replace double quotes.
    res = res.replace(new RegExp('"', 'g'), "'");
    // Add double quotes and return.
    return '"' + res + '"';
}
var _a, _b, _c;
//# sourceMappingURL=contact-list.component.js.map

/***/ }),

/***/ "../../../../../src/app/effects/contact.effects.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return ContactEffects; });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1_rxjs_add_operator_map__ = __webpack_require__("../../../../rxjs/add/operator/map.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1_rxjs_add_operator_map___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_1_rxjs_add_operator_map__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2_rxjs_add_operator_mergeMap__ = __webpack_require__("../../../../rxjs/add/operator/mergeMap.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2_rxjs_add_operator_mergeMap___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_2_rxjs_add_operator_mergeMap__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__ = __webpack_require__("../../../../rxjs/Observable.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_4__ngrx_effects__ = __webpack_require__("../../../../@ngrx/effects/@ngrx/effects.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_5__actions_contact_actions__ = __webpack_require__("../../../../../src/app/actions/contact.actions.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_6__services_dal_service__ = __webpack_require__("../../../../../src/app/services/dal.service.ts");
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};







var ContactEffects = (function () {
    function ContactEffects(actions$, contactActions, svc) {
        var _this = this;
        this.actions$ = actions$;
        this.contactActions = contactActions;
        this.svc = svc;
        this.loadContacts$ = this.actions$
            .ofType(__WEBPACK_IMPORTED_MODULE_5__actions_contact_actions__["a" /* ContactActions */].LOAD_CONTACTS)
            .mergeMap(function () { return _this.svc.list(); })
            .map(function (contacts) { return _this.contactActions.loadContactsSuccess(contacts); });
        this.getContact$ = this.actions$
            .ofType(__WEBPACK_IMPORTED_MODULE_5__actions_contact_actions__["a" /* ContactActions */].GET_CONTACT)
            .map(function (action) { return action.payload; })
            .mergeMap(function (id) { return _this.svc.get(id); })
            .map(function (contact) { return _this.contactActions.getContactSuccess(contact); });
        this.saveContact$ = this.actions$
            .ofType(__WEBPACK_IMPORTED_MODULE_5__actions_contact_actions__["a" /* ContactActions */].SAVE_CONTACT)
            .map(function (action) { return action.payload; })
            .mergeMap(function (contact) { return _this.svc.save(contact); })
            .mergeMap(function (result) { return _this.svc.get(result.id); })
            .map(function (contact) { return _this.contactActions.saveContactSuccess(contact); });
        this.deleteContact$ = this.actions$
            .ofType(__WEBPACK_IMPORTED_MODULE_5__actions_contact_actions__["a" /* ContactActions */].DELETE_CONTACT)
            .map(function (action) { return action.payload; })
            .mergeMap(function (contact) { return _this.svc.delete(contact); })
            .map(function (result) { return _this.contactActions.deleteContactSuccess(result); });
    }
    return ContactEffects;
}());
__decorate([
    Object(__WEBPACK_IMPORTED_MODULE_4__ngrx_effects__["b" /* Effect */])(),
    __metadata("design:type", typeof (_a = typeof __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__["Observable"] !== "undefined" && __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__["Observable"]) === "function" && _a || Object)
], ContactEffects.prototype, "loadContacts$", void 0);
__decorate([
    Object(__WEBPACK_IMPORTED_MODULE_4__ngrx_effects__["b" /* Effect */])(),
    __metadata("design:type", typeof (_b = typeof __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__["Observable"] !== "undefined" && __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__["Observable"]) === "function" && _b || Object)
], ContactEffects.prototype, "getContact$", void 0);
__decorate([
    Object(__WEBPACK_IMPORTED_MODULE_4__ngrx_effects__["b" /* Effect */])(),
    __metadata("design:type", typeof (_c = typeof __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__["Observable"] !== "undefined" && __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__["Observable"]) === "function" && _c || Object)
], ContactEffects.prototype, "saveContact$", void 0);
__decorate([
    Object(__WEBPACK_IMPORTED_MODULE_4__ngrx_effects__["b" /* Effect */])(),
    __metadata("design:type", typeof (_d = typeof __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__["Observable"] !== "undefined" && __WEBPACK_IMPORTED_MODULE_3_rxjs_Observable__["Observable"]) === "function" && _d || Object)
], ContactEffects.prototype, "deleteContact$", void 0);
ContactEffects = __decorate([
    Object(__WEBPACK_IMPORTED_MODULE_0__angular_core__["Injectable"])(),
    __metadata("design:paramtypes", [typeof (_e = typeof __WEBPACK_IMPORTED_MODULE_4__ngrx_effects__["a" /* Actions */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_4__ngrx_effects__["a" /* Actions */]) === "function" && _e || Object, typeof (_f = typeof __WEBPACK_IMPORTED_MODULE_5__actions_contact_actions__["a" /* ContactActions */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_5__actions_contact_actions__["a" /* ContactActions */]) === "function" && _f || Object, typeof (_g = typeof __WEBPACK_IMPORTED_MODULE_6__services_dal_service__["a" /* DalService */] !== "undefined" && __WEBPACK_IMPORTED_MODULE_6__services_dal_service__["a" /* DalService */]) === "function" && _g || Object])
], ContactEffects);

var _a, _b, _c, _d, _e, _f, _g;
//# sourceMappingURL=contact.effects.js.map

/***/ }),

/***/ "../../../../../src/app/models/contact.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return Contact; });
var Contact = (function () {
    function Contact() {
        this._id = null;
        this.name = '';
        this.phone = '';
        this.address = '';
        this.email = '';
        this.relative = false;
    }
    return Contact;
}());

//# sourceMappingURL=contact.js.map

/***/ }),

/***/ "../../../../../src/app/reducers/contact-list.reducer.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (immutable) */ __webpack_exports__["a"] = ContactListReducer;
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__actions_contact_actions__ = __webpack_require__("../../../../../src/app/actions/contact.actions.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1_lodash__ = __webpack_require__("../../../../lodash/lodash.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1_lodash___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_1_lodash__);


;
var initialState = {
    list: [],
    loading: false
};
function ContactListReducer(state, action) {
    if (state === void 0) { state = initialState; }
    switch (action.type) {
        case __WEBPACK_IMPORTED_MODULE_0__actions_contact_actions__["a" /* ContactActions */].LOAD_CONTACTS: {
            return __WEBPACK_IMPORTED_MODULE_1_lodash__["assign"]({}, state, {
                loading: true
            });
        }
        case __WEBPACK_IMPORTED_MODULE_0__actions_contact_actions__["a" /* ContactActions */].LOAD_CONTACTS_SUCCESS: {
            return __WEBPACK_IMPORTED_MODULE_1_lodash__["assign"]({}, state, {
                list: action.payload,
                loading: false
            });
        }
        case __WEBPACK_IMPORTED_MODULE_0__actions_contact_actions__["a" /* ContactActions */].SAVE_CONTACT_SUCCESS: {
            var index = __WEBPACK_IMPORTED_MODULE_1_lodash__["findIndex"](state.list, { id: action.payload.id });
            if (index >= 0) {
                return __WEBPACK_IMPORTED_MODULE_1_lodash__["assign"]({}, state, {
                    list: state.list.slice(0, index).concat([
                        action.payload
                    ], state.list.slice(index + 1))
                });
            }
            return state;
        }
        case __WEBPACK_IMPORTED_MODULE_0__actions_contact_actions__["a" /* ContactActions */].DELETE_CONTACT_SUCCESS: {
            return __WEBPACK_IMPORTED_MODULE_1_lodash__["assign"]({}, state, {
                list: state.list.filter(function (contact) {
                    return contact._id !== action.payload.id;
                })
            });
        }
        default: {
            return state;
        }
    }
}
//# sourceMappingURL=contact-list.reducer.js.map

/***/ }),

/***/ "../../../../../src/app/reducers/contact.reducer.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (immutable) */ __webpack_exports__["a"] = ContactReducer;
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__models_contact__ = __webpack_require__("../../../../../src/app/models/contact.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1__actions_contact_actions__ = __webpack_require__("../../../../../src/app/actions/contact.actions.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2_lodash__ = __webpack_require__("../../../../lodash/lodash.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2_lodash___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_2_lodash__);



;
var initialState = {
    contact: new __WEBPACK_IMPORTED_MODULE_0__models_contact__["a" /* Contact */](),
    loading: false,
    saving: false
};
function ContactReducer(state, action) {
    if (state === void 0) { state = initialState; }
    switch (action.type) {
        case __WEBPACK_IMPORTED_MODULE_1__actions_contact_actions__["a" /* ContactActions */].RESET_BLANK_CONTACT: {
            return __WEBPACK_IMPORTED_MODULE_2_lodash__["assign"]({}, state, {
                contact: __WEBPACK_IMPORTED_MODULE_2_lodash__["cloneDeep"](initialState.contact),
                loading: false,
                saving: false
            });
        }
        case __WEBPACK_IMPORTED_MODULE_1__actions_contact_actions__["a" /* ContactActions */].GET_CONTACT: {
            return __WEBPACK_IMPORTED_MODULE_2_lodash__["assign"]({}, state, {
                loading: true
            });
        }
        case __WEBPACK_IMPORTED_MODULE_1__actions_contact_actions__["a" /* ContactActions */].SAVE_CONTACT: {
            return __WEBPACK_IMPORTED_MODULE_2_lodash__["assign"]({}, state, {
                saving: true
            });
        }
        case __WEBPACK_IMPORTED_MODULE_1__actions_contact_actions__["a" /* ContactActions */].GET_CONTACT_SUCCESS: {
            return __WEBPACK_IMPORTED_MODULE_2_lodash__["assign"]({}, state, {
                contact: action.payload,
                loading: false,
                saving: false
            });
        }
        case __WEBPACK_IMPORTED_MODULE_1__actions_contact_actions__["a" /* ContactActions */].SAVE_CONTACT_SUCCESS: {
            return __WEBPACK_IMPORTED_MODULE_2_lodash__["assign"]({}, state, {
                contact: action.payload,
                loading: false,
                saving: false
            });
        }
        default: {
            return state;
        }
    }
}
//# sourceMappingURL=contact.reducer.js.map

/***/ }),

/***/ "../../../../../src/app/services/dal.service.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return DalService; });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1__lib_pouchdb_5_3_2_min__ = __webpack_require__("../../../../../lib/pouchdb-5.3.2.min.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1__lib_pouchdb_5_3_2_min___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_1__lib_pouchdb_5_3_2_min__);
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};


var DalService = (function () {
    function DalService() {
        // Create/open database.
        this.myDb = new __WEBPACK_IMPORTED_MODULE_1__lib_pouchdb_5_3_2_min__('AddressBook');
        // Define auxiliary function.
        this.allFun = function (doc, emit) {
            emit(doc._id, doc);
        };
    }
    /**
     * Get the lists of contacts.
     *
     * @returns {object} A promise.
     */
    DalService.prototype.list = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.myDb.query(_this.allFun, function (err, response) {
                if (!err) {
                    // Parse result.
                    var res = [];
                    if (response && response.rows) {
                        for (var i = 0; i < response.rows.length; i++) {
                            res.push(response.rows[i].value);
                        }
                    }
                    // Invoke callback.
                    resolve(res);
                }
                else {
                    reject(err);
                }
            });
        });
    };
    /**
     * Get a contact.
     *
     * @param {string} id The contact's id.
     * @returns {object} A promise.
     */
    DalService.prototype.get = function (id) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.myDb.get(id, function (err, doc) {
                if (!err) {
                    resolve(doc);
                }
                else {
                    reject(err);
                }
            });
        });
    };
    /**
     * Saves a contact.
     *
     * @param {object} doc The contact's details.
     * @returns {object} A promise.
     */
    DalService.prototype.save = function (doc) {
        // Verify if the contact is new or is an update.
        doc = doc || {};
        if (doc._id == null) {
            doc._id = 'id.' + new Date().getTime();
        }
        // Save contact.
        return this.myDb.put(doc, doc.id);
    };
    /**
     * Deletes a contact.
     *
     * @param {string} doc The contact to delete.
     * @returns {object} A promise.
     */
    DalService.prototype.delete = function (doc) {
        return this.myDb.remove(doc._id, doc._rev);
    };
    return DalService;
}());
DalService = __decorate([
    Object(__WEBPACK_IMPORTED_MODULE_0__angular_core__["Injectable"])(),
    __metadata("design:paramtypes", [])
], DalService);

//# sourceMappingURL=dal.service.js.map

/***/ }),

/***/ "../../../../../src/environments/environment.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return environment; });
// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.
// The file contents for the current environment will overwrite these during build.
var environment = {
    production: false
};
//# sourceMappingURL=environment.js.map

/***/ }),

/***/ "../../../../../src/main.ts":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
Object.defineProperty(__webpack_exports__, "__esModule", { value: true });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__angular_core__ = __webpack_require__("../../../core/@angular/core.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1__angular_platform_browser_dynamic__ = __webpack_require__("../../../platform-browser-dynamic/@angular/platform-browser-dynamic.es5.js");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2__app_app_module__ = __webpack_require__("../../../../../src/app/app.module.ts");
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3__environments_environment__ = __webpack_require__("../../../../../src/environments/environment.ts");




if (__WEBPACK_IMPORTED_MODULE_3__environments_environment__["a" /* environment */].production) {
    Object(__WEBPACK_IMPORTED_MODULE_0__angular_core__["enableProdMode"])();
}
Object(__WEBPACK_IMPORTED_MODULE_1__angular_platform_browser_dynamic__["a" /* platformBrowserDynamic */])().bootstrapModule(__WEBPACK_IMPORTED_MODULE_2__app_app_module__["a" /* AppModule */]);
//# sourceMappingURL=main.js.map

/***/ }),

/***/ 0:
/***/ (function(module, exports, __webpack_require__) {

module.exports = __webpack_require__("../../../../../src/main.ts");


/***/ })

},[0]);
//# sourceMappingURL=main.bundle.js.map