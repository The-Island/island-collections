/*
 * index.js: Island collections.
 *
 */

// Module Dependencies
var util = require('util');
var sutil = require('island-util');
var Step = require('step');
var _ = require('underscore');
_.mixin(require('underscore.string'));


/*
collectionName: {
  resource: If this collection has an API that should be attached to the main
            router and has a separate resource file. eg, GET on api/dataset
  indexes:  Properties that Mongo should index on
  uniques:  Which indexes should be unique or throw an error. Should be arrray
            of same length as sparses
  sparses:  Allow documents to have non-unique null values. Ignores nulls
            effectively
},
*/

// Resource collections.
exports.collections = {
  member: {
    indexes: [{primaryEmail: 1}, {username: 1}, {role: 1}],
    uniques: [true, true, false],
    sparses: [true, false, false]
  },
  post: {
    indexes: [{key: 1}, {author_id: 1}],
    uniques: [true, false]
  },
  media: {
    indexes: [{type: 1}, {author_id: 1}, {parent_id: 1}],
    uniques: [false, false, false]
  },
  comment: {
    indexes: [{author_id: 1}, {parent_id: 1}],
    uniques: [false, false]
  },
  hangten: {
    indexes: [{author_id: 1, parent_id: 1}],
    uniques: [true]
  },
  country: {
    indexes: [{key: 1}],
    uniques: [true]
  },
  crag: {
    indexes: [{key: 1}, {type: 1}, {country_id: 1}],
    uniques: [true, false, false]
  },
  ascent: {
    indexes: [{key: 1}, {type: 1}, {country_id: 1}, {crag_id: 1}],
    uniques: [true, false, false, false]
  },
  session: {
    indexes: [{key: 1}, {env: 1}, {author_id: 1}, {country_id: 1}, {crag_id: 1}],
    uniques: [true, false, false, false, false]
  },
  action: {
    indexes: [{type: 1}, {author_id: 1}, {crag_id: 1}, {session_id: 1}],
    uniques: [false, false, false, false]
  },
  tick: {
    indexes: [{type: 1}, {sent: 1}, {author_id: 1}, {crag_id: 1}, {ascent_id: 1}],
    uniques: [false, false, false, false, false]
  },
  subscription: {
    indexes: [{subscriber_id: 1, subscribee_id: 1}, {type: 1}],
    uniques: [true, false]
  },
  event: {
    indexes: [{actor_id: 1}, {target_id: 1}, {created: 1}, {date: 1}],
    uniques: [false, false, false, false]
  },
  notification: {
    indexes: [{subscriber_id: 1}, {read: 1}],
    uniques: [false, false]
  },
  key: {}
};

// Resource profiles for client objects.
exports.profiles = {
  member: {
    collection: 'member',
    username: 1,
    role: 1,
    displayName: 1,
    privacy: function (d) {
      return Number(d.config.privacy.mode);
    },
    gravatar: function (d) {
      return com.hash(d.primaryEmail || 'foo@bar.baz');
    },
    facebookId: 1,
    twitterId: 1,
    vcnt: 1,
  },
  post: {
    collection: 'post',
    public: 1,
    key: 1,
    type: 1,
    title: 1,
    vcnt: 1,
  },
  media: {
    collection: 'media',
    key: 1,
    type: 1,
  },
  comment: {
    collection: 'comment',
    body: 1,
  },
  session: {
    collection: 'session',
    env: 1,
    name: 1,
    date: 1,
    vcnt: 1,
  },
  action: {
    collection: 'action',
    env: 1,
    type: 1,
    duration: 1,
    performance: 1,
    date: 1,
  },
  tick: {
    collection: 'tick',
    public: 1,
    type: 1,
    sent: 1,
    grade: 1,
    feel: 1,
    tries: 1,
    rating: 1,
    date: 1,
    first: 1,
    firstf: 1,
    vcnt: 1,
  },
  crag: {
    collection: 'crag',
    public: 1,
    key: 1,
    name: 1,
    city: 1,
    country: 1,
    location: 1,
    vcnt: 1,
  },
  ascent: {
    collection: 'ascent',
    public: 1,
    key: 1,
    name: 1,
    crag: 1,
    country: 1,
    type: 1,
    grades: 1,
    sector: 1,
    location: 1,
    vcnt: 1,
  },
  event: {
    collection: 'event',
    data: 1,
  },
};

/*
 * Determine if member can access resource.
 */
var hasAccess = exports.hasAccess = function (db, member, resource, cb) {
  Step(
    function () {
      var next = this;

      // Walk up parents until have actual resource.
      (function _parent(err, doc) {
        if (err) return next(err);
        if (!doc.parent_id || !doc.parent_type) {
          return next(null, doc);
        }
        db[_.capitalize(doc.parent_type) + 's']
            .read({_id: db.oid.isValid(doc.parent_id) ? doc.parent_id:
            db.oid(doc.parent_id)}, _parent);
      })(null, resource);

    }, function (err, resource) {
      if (err) return cb(err);

      // Get the resource author.
      var author_id = resource.author ? resource.author._id:
          resource.author_id;
      var _author_id = db.oid.isValid(author_id) ? author_id: db.oid(author_id);
      db.Users.read({_id: _author_id}, this.parallel());

      // Look for a subscription.
      if (member) {
        db.Subscriptions.read({subscriber_id: db.oid.isValid(member._id) ?
            member._id: db.oid(member._id), subscribee_id: _author_id,
            mute: false, 'meta.style': 'follow'}, this.parallel());
      }
    },
    function (err, author, sub) {
      if (err) return cb(err);
      if (!author || !author.config) {
        return cb('Could not find resource author');
      }

      // Check resource privacy.
      if (resource.public === false) {
        if (!member || member._id.toString() !== author._id.toString()) {
          return cb(null, false);
        }
      }

      // Check member privacy.
      if (!sub && author.config.privacy.mode.toString() === '1') {
        if (!member || member._id.toString() !== author._id.toString()) {
          return cb(null, false);
        }
      }

      cb(null, true);
    }
  );
};
