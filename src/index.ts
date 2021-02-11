/* istanbul ignore next */
if (process.env.NODE_ENV !== "test") {
  require("source-map-support").install();
}

import { parse as parseUrl, resolve as resolveUrl } from "url";
import { Parser } from "htmlparser2";
import fetch from "cross-fetch";
import UnexpectedError from "./unexpectedError";
import { schema, keys } from "./schema";
import { Metadata, Opts } from "./types";
import { decode as he_decode } from "he";
import { decode as iconv_decode } from "iconv-lite";

function unfurl(url: string, opts?: Opts): Promise<Metadata> {
  if (opts === undefined) {
    opts = {};
  }

  if (opts.constructor.name !== "Object") {
    throw new UnexpectedError(UnexpectedError.BAD_OPTIONS);
  }

  typeof opts.oembed === "boolean" || (opts.oembed = true);
  typeof opts.compress === "boolean" || (opts.compress = true);
  typeof opts.userAgent === "string" ||
    (opts.userAgent = "facebookexternalhit");

  Number.isInteger(opts.follow) || (opts.follow = 50);
  Number.isInteger(opts.timeout) || (opts.timeout = 0);
  Number.isInteger(opts.size) || (opts.size = 0);

  const ctx: {
    url?: string,
    oembedUrl?: string
  } = {
    url
  };

  return getPage(url, opts)
    .then(getMetadata(ctx, opts))
    .then(getRemoteMetadata(ctx, opts))
    .then(parse(ctx));
}

async function getPage(url: string, opts: Opts) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html, application/xhtml+xml",
      "User-Agent": opts.userAgent
    }
  });

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("Content-Type");
  const contentLength = res.headers.get("Content-Length");

  if (/text\/html|application\/xhtml+xml/.test(contentType) === false) {
    throw new UnexpectedError({
      ...UnexpectedError.EXPECTED_HTML,
      info: { contentType, contentLength, body: buf.toString() }
    });
  }

  // no charset in content type, peek at response body for at most 1024 bytes
  let str = buf.slice(0, 1024).toString();
  let rg;

  if (contentType) {
    rg = /charset=([^;]*)/i.exec(contentType);
  }

  // html 5
  if (!rg && str) {
    rg = /<meta.+?charset=(['"])(.+?)\1/i.exec(str);
  }

  // html 4
  if (!rg && str) {
    rg = /<meta.+?content=["'].+;\s?charset=(.+?)["']/i.exec(str);
  }

  // found charset
  if (rg) {
    const supported = [
      "CP932",
      "CP936",
      "CP949",
      "CP950",
      "GB2312",
      "GBK",
      "GB18030",
      "BIG5",
      "SHIFT_JIS",
      "EUC-JP"
    ];
    const charset = rg.pop().toUpperCase();

    if (supported.includes(charset)) {
      return iconv_decode(buf, charset).toString();
    }
  }

  return {
    text: buf.toString(),
    response: res
  };
}

function getRemoteMetadata(ctx, opts) {
  return async function(metadata) {
    if (!ctx._oembed) {
      return metadata;
    }

    const target = resolveUrl(ctx.url, ctx._oembed.href);

    const res = await fetch(target);
    const contentType = res.headers.get("Content-Type");
    const contentLength = res.headers.get("Content-Length");

    let ret;

    if (
      ctx._oembed.type === "application/json+oembed" &&
      /application\/json/.test(contentType)
    ) {
      ret = await res.json();
    } else if (
      ctx._oembed.type === "text/xml+oembed" &&
      /text\/xml/.test(contentType)
    ) {
      let data = await res.text();

      let content: any = {};

      ret = await new Promise((resolve, reject) => {
        const parser = new Parser({
          onopentag: function(name, attribs) {
            if (this._is_html) {
              if (!content.html) {
                content.html = "";
              }

              content.html += `<${name} `;
              content.html += Object.keys(attribs)
                .reduce(
                  (str, k) =>
                    str + (attribs[k] ? `${k}="${attribs[k]}"` : `${k}`) + " ",
                  ""
                )
                .trim();
              content.html += ">";
            }

            if (name === "html") {
              this._is_html = true;
            }

            this._tagname = name;
          },
          ontext: function(text) {
            if (!this._text) this._text = "";
            this._text += text;
          },
          onclosetag: function(tagname) {
            if (tagname === "oembed") {
              return;
            }

            if (tagname === "html") {
              this._is_html = false;
              return;
            }

            if (this._is_html) {
              content.html += this._text.trim();
              content.html += `</${tagname}>`;
            }

            content[tagname] = this._text.trim();

            this._tagname = "";
            this._text = "";
          },
          onend: function() {
            resolve(content);
          }
        });

        parser.write(data);
        parser.end();
      });
    }

    if (!ret) {
      return metadata;
    }

    const oEmbedMetadata = Object.keys(ret)
      .map(k => ["oEmbed:" + k, ret[k]])
      .filter(([k, v]) => keys.includes(String(k)));

    metadata.push(...oEmbedMetadata);
    return metadata;
  };
}

function getMetadata(ctx, opts: Opts) {
  return function({response, text}) {
    const metadata = [response, text];

    return new Promise(resolve => {
      const parser: any = new Parser({
        onend: function() {
          this._favicon.lastResort = resolveUrl(ctx.url, "/favicon.ico");
          metadata.push(["favicon", this._favicon]);

          metadata.push(["ld", this._linkedData]);

          resolve(metadata);
        },

        ontext: function(text) {
          if (this._tagname === "title") {
            // makes sure we haven't already seen the title
            if (this._title !== null) {
              if (this._title === undefined) {
                this._title = "";
              }

              this._title += text;
            }
          }

          if (
            this._tagname === "script" &&
            this._attribs.type === "application/ld+json"
          ) {
            try {
              this._linkedData.push(JSON.parse(text));
            } catch(e) {
              console.warn("application/ld+json parse failure. Omitting.");
              console.warn(e);
            }
          }
        },

        onopentag: function(tagname, attribs) {
          this._tagname = tagname;
          this._attribs = attribs;

          if (tagname == "head") {
            this._favicon = {};
            this._linkedData = [];
          }

          if (opts.oembed && attribs.href) {
            // handle XML and JSON with a preference towards JSON since its more efficient for us
            if (
              tagname === "link" &&
              (attribs.type === "text/xml+oembed" ||
                attribs.type === "application/json+oembed")
            ) {
              if (!ctx._oembed || ctx._oembed.type === "text/xml+oembed") {
                // prefer json
                ctx._oembed = attribs;
              }
            }
          }

          if (tagname === "link" && attribs.href) {

            if (attribs.rel != null) {
              let rel = attribs.rel.toLowerCase();
              if (
                rel === "icon" ||
                rel === "shortcut icon" ||
                rel === "apple-touch-icon" ||
                rel === "apple-touch-icon-precomposed"
              ) {
                  let key, ref;
                  key = (ref = attribs.sizes) != null ? ref : "default";
                  this._favicon[key] = attribs.href;
              }

              if (rel === "canonical") {
                metadata.push(["url", attribs.href]);
              }
            }

          }

          let pair;

          if (tagname === "meta") {
            if (attribs.name === "description") {
              pair = ["description", attribs.content];
            } else if (attribs.name === "keywords") {
              let keywords = attribs.content
                .replace(/^[,\s]{1,}|[,\s]{1,}$/g, "") // gets rid of trailing space or sommas
                .split(/,{1,}\s{0,}/); // splits on 1+ commas followed by 0+ spaces

              pair = ["keywords", keywords];
            } else if (attribs.property && keys.includes(attribs.property)) {
              pair = [attribs.property, attribs.content];
            } else if (attribs.name && keys.includes(attribs.name)) {
              pair = [attribs.name, attribs.content];
            }
          }

          if (pair) {
            metadata.push(pair);
          }
        },

        onclosetag: function(tag) {
          this._tagname = "";

          if (tag === "title") {
            metadata.push(["title", this._title]);
            this._title = "";
          }
        }
      });

      parser.write(text);
      parser.end();
    });
  };
}

function isObject(value) {
  if (value != null) {
    return (Object.getPrototypeOf(value)) === Object.prototype;
  } else {
    return false;
  }
};

function isArray(value) {
  if (value != null) {
    return (Object.getPrototypeOf(value)) === Array.prototype;
  } else {
    return false;
  }
};

function decodeMetaValue(input) {
  var i, j, key, len, results, value;
  if (isObject(input)) {
    for (key in input) {
      value = input[key];
      input[key] = decodeMetaValue(value);
    }
    return input;
  } else if (isArray(input)) {
    results = [];
    for (j = 0, len = input.length; j < len; j++) {
      i = input[j];
      results.push(decodeMetaValue(i));
    }
    return results;
  } else {
    if ((input != null ? input.toString : void 0) != null) {
      return he_decode(he_decode(input.toString()));
    } else {
      return null;
    }
  }
};

function parse(ctx) {
  return function(metadata) {
    const parsed: any = {};

    let tags = [];
    let lastParent;

    let response = metadata.shift();
    let text = metadata.shift();

    for (let [metaKey, metaValue] of metadata) {
      const item = schema.get(metaKey);

      // decoding html entities
      metaValue = decodeMetaValue(metaValue);

      if (!item) {
        parsed[metaKey] = metaValue;
        continue;
      }

      // special case for video tags which we want to map to each video object
      if (metaKey === "og:video:tag") {
        tags.push(metaValue);
        continue;
      }

      if (item.type === "number") {
        metaValue = parseInt(metaValue, 10);
      } else if (item.type === "url") {
        metaValue = resolveUrl(ctx.url, metaValue);
      }

      if (parsed[item.entry] === undefined) {
        parsed[item.entry] = {};
      }

      let target = parsed[item.entry];

      if (item.parent) {
        if (item.category) {
          if (!target[item.parent]) {
            target[item.parent] = {};
          }

          if (!target[item.parent][item.category]) {
            target[item.parent][item.category] = {};
          }

          target = target[item.parent][item.category];
        } else {
          if (Array.isArray(target[item.parent]) === false) {
            target[item.parent] = [];
          }

          if (!target[item.parent][target[item.parent].length - 1]) {
            target[item.parent].push({});
          } else if (
            (!lastParent || item.parent === lastParent) &&
            target[item.parent][target[item.parent].length - 1] &&
            target[item.parent][target[item.parent].length - 1][item.name]
          ) {
            target[item.parent].push({});
          }

          lastParent = item.parent;
          target = target[item.parent][target[item.parent].length - 1];
        }
      }

      // some fields map to the same name so once nicwe have one stick with it
      target[item.name] || (target[item.name] = metaValue);
    }

    if (tags.length && parsed.open_graph.videos) {
      parsed.open_graph.videos = parsed.open_graph.videos.map(obj => ({
        ...obj,
        tags
      }));
    }

    // Special case for favicon processing.
    if (parsed.vanilla == null) {
      parsed.vanilla = {};
    }
    parsed.vanilla.favicon = {};

    let key, ref, value;
    ref = parsed.favicon;
    for (key in ref) {
      value = ref[key];
      parsed.vanilla.favicon[key] = resolveUrl(ctx.url, value);
    }
    delete parsed.favicon;

    return {parsed, response, text};
  };
}

module.exports = unfurl;
