/**
 * @namespace WebDAV
 */
var WebDAV = {
  // TODO: move this to Fs
  useCredentials: false,
  NS: 'DAV:',

  GET: function(url, callback) {
    return this.request('GET', url, {}, null, 'text', callback);
  },

  PROPFIND: function(url, callback) {
    return this.request('PROPFIND', url, {Depth: "1"}, null, 'xml', callback);
  },

  MKCOL: function(url, callback) {
    return this.request('MKCOL', url, {}, null, 'text', callback);
  },

  DELETE: function(url, callback) {
    return this.request('DELETE', url, {}, null, 'text', callback);
  },

  PUT: function(url, data, callback) {
    return this.request('PUT', url, {}, data, 'text', callback);
  },

  MOVE:  function(url, destinationUrl, callback) {
    return this.request('MOVE', url, {Destination: destinationUrl}, null, 'text', callback);
  },

  request: function(verb, url, headers, data, type, callback) {
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = this.useCredentials;
    var body = function() {
      var b = xhr.responseText;
      if (type == 'xml') {
        var xml = xhr.responseXML;
        if(xml) {
          b = xml.firstChild.nextSibling ? xml.firstChild.nextSibling : xml.firstChild;
        }
      }
      return b;
    };

    if(callback) {
      xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) { // complete.
          var b = body();
          if(b) {
            callback(b, xhr.status);
          } else {
            callback(null, xhr.status);
          }
        }
      };
    }
    xhr.open(verb, url, !!callback);
    xhr.setRequestHeader("Content-Type", "text/xml; charset=UTF-8");
    for (var header in headers) {
      xhr.setRequestHeader(header, headers[header]);
    }
    xhr.send(data);

    if(!callback) {
      return body();
    }
  }
};


/**
 * @class WebDAV.File
 */
WebDAV.File = function(fs, href, prop) {
  this._fs = fs;

  /**
   * Can either be 'dir' or 'file'
   * @var {String} File.type
   */
  this.type = '';

  this.exists = null;

  this.size = -1;
  this.mtime = null;

  this.href = href;
  this.url = fs.urlFor(href);
  this.name = fs.nameFor(this.url);

  if (prop) {
    this.setProps(prop);
  }
};

WebDAV.File.prototype.read = function(callback) {
  return WebDAV.GET(this.url, callback);
};

WebDAV.File.prototype.write = function(data, callback) {
  return WebDAV.PUT(this.url, data, callback);
};

WebDAV.File.prototype.rm = function(callback) {
  return WebDAV.DELETE(this.url, callback);
};

WebDAV.File.prototype.mv = function(newHref, callback) {
  var newUrl = this._fs.urlFor(newHref);
  return WebDAV.MOVE(this.url, newUrl, callback);
};

WebDAV.File.prototype.rename = function(newName, callback) {
  var lastDelimIndex = this.href.lastIndexOf('/');
  var parentDir = this.href.substring(0, lastDelimIndex + 1);

  var newHref = parentDir + newName;
  return this.mv(newHref, callback);
};

WebDAV.File.prototype.propfind = function(callback) {
  WebDAV.PROPFIND(this.url, function(doc) {

    var ns = WebDAV.NS;
    var response = doc.children[0];
    var propstat = response.getElementsByTagNameNS(ns, 'propstat')[0];
    var status = propstat.getElementsByTagNameNS(ns, 'status')[0].innerHTML;

    this.exists = status.toLowerCase().indexOf('404 not found') < 0;

    if (this.exists) {
      var prop = propstat.getElementsByTagNameNS(ns, 'prop')[0];
      this.setProps(prop);
    }

    callback();

  }.bind(this));
};

WebDAV.File.prototype.setProps = function(prop) {
  var ns = WebDAV.NS;
  var resourcetype = prop.getElementsByTagNameNS(ns, 'resourcetype')[0];
  var collection   = resourcetype.getElementsByTagNameNS(ns, 'collection')[0];

  // this.type = resourceType.firstChild.tagName.indexOf('collection') < 0 ? 'file' : 'dir';
  this.type = collection ? 'dir' : 'file';
  this.size = parseInt(prop.getElementsByTagNameNS(ns, 'getcontentlength')[0].innerHTML);
  this.mtime = new Date(prop.getElementsByTagNameNS(ns, 'getlastmodified')[0].innerHTML);
};

WebDAV.File.prototype.children = function(callback) {
  if (this.type !== 'dir') {
    throw new Error('children is only available on directories');
  }

  var fs = this._fs;

  var childrenFunc = function(doc) {
    if(doc.children == null) {
      throw('No such directory: ' + url);
    }

    var ns = WebDAV.NS;
    var result = [];
    // Start at 1, because the 0th is the same as self.
    for(var i=1; i< doc.children.length; i++) {
      var response     = doc.children[i];
      var href         = response.getElementsByTagNameNS(ns, 'href')[0].firstChild.nodeValue;
      href = href.replace(/\/$/, ''); // Strip trailing slash
      var propstat     = response.getElementsByTagNameNS(ns, 'propstat')[0];
      var prop         = propstat.getElementsByTagNameNS(ns, 'prop')[0];

      var f = new WebDAV.File(fs, href, prop);
      result[i-1] = f;
    }
    return result;
  };

  if(callback) {
    WebDAV.PROPFIND(this.url, function(doc) {
      callback(childrenFunc(doc));
    });
  } else {
    return childrenFunc(WebDAV.PROPFIND(this.url));
  }
};

WebDAV.File.prototype.mkdir = function(callback) {
  if (this.type !== 'dir') {
    throw new Error('mkdir is only available on directories');
  }

  return WebDAV.MKCOL(this.url, callback);
};


/**
 * @class WebDAV.Fs
 */
WebDAV.Fs = function(rootUrl) {
  this.rootUrl = rootUrl;
  this.useCredentials = false;
};

WebDAV.Fs.prototype.file = function(href) {
  var f = new WebDAV.File(this, href);
  f.type = 'file';
  return f;
};

WebDAV.Fs.prototype.dir = function(href) {
  var f = new WebDAV.File(this, href);
  f.type = 'dir';
  return f;
};

WebDAV.Fs.prototype.urlFor = function(href) {
  return (/^http/.test(href) ? href : this.rootUrl + href);
};

WebDAV.Fs.prototype.nameFor = function(url) {
  return url.replace(/.*\/(.*)/, '$1');
};

