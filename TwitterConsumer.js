/**
 * A class used to consume and interact with the
 * twitter api and its response.
 * 
 * This is basically the main part of the Selenite
 * application.
 * 
 * @author  mcro591<at>aucklanduni.ac.nz
 */
class TwitterConsumer {
    /**
     * Construct the TwitterConsumer class
     * 
     * @param {string} mongo_uri uri to connect to the database.
     */
    constructor(mongo_uri) {
        this.M = require('mongodb').MongoClient;

        this.coll_name = 'twitter';
        this.similarity_percent = 0.75; // min percent for a word to be similar
        this.partial_percent = 0.5; // min percent for a partial match
        this.mongo_uri = mongo_uri;
        this.cache = { meta: {}, data: [] };
    }

    // Getters and setters
    ///////////////////////////////
    /**
     * Get an array or comma-delimiteed string of
     * account ids to follow in the stream filter
     * of twitter api.
     * 
     * @param {boolean} [as_array=false] true to return an array
     * 
     * @returns {string|Array} comma-delimited ids or array of string ids
     */
    getFollowedAccIds(as_array = false) {
        let acc_ids = [];
        if (typeof this.cache.data !== 'object' ) {
            console.warn(`TwitterConsumer.getFollowedAccIds(${as_array}): cache not initialised for this collection '${this.coll_name}'`);
        } else {
            if (this.cache.data.length < 1) {
                console.warn(`TwitterConsumer.getFollowedAccIds(${as_array}): no accounts listed to follow in stream`);
            }
            
            this.cache.data.forEach(item => {
                acc_ids.push(item.account.id);
            });
        }

        if (as_array) {
            return acc_ids;
        }

        return acc_ids.join(',');
    }

    /**
     * Given a streaming twitter event, split the
     * tweet text into words and match similar
     * words with specified search terms. If the
     * words match the search terms as per
     * search_type, return the reply. Otherwise,
     * if nothing matches return false.
     * 
     * @param {Object} event object from the twitter streaming api
     * 
     * @returns {String|boolean}
     */
    getResponse(event) {
        if (this.checkTweetRelevance(event.in_reply_to_user_id_str,
            event.in_reply_to_status_id_str) === 2) {
            // Relevant tweet, get a response
            let account = this.cache.data.filter((x) => {
                return x.account.id === event.in_reply_to_user_id_str;
            })[0];
            let tweet = account.tweets.filter((x) => {
                return x.id === event.in_reply_to_status_id_str;
            })[0];

            let response = false;
            let tweet_text = event.text;
            let tweet_words = tweet_text.split(' ');
            let match_count = 0;
            tweet.replies.forEach(reply => {
                tweet_words.forEach(word => {
                    reply.search.forEach(search_word => {
                        let match_percent = this.strSimilarity(word, search_word);
                        if (match_percent > this.similarity_percent) {
                            match_count++;
                        }
                    });
                });

                if (reply.search_type === 'all') { // search terms require all words to match
                    if (match_count === reply.search.length) {
                        response = reply.response;
                    }
                } else if (reply.search_type === 'partial') { // search terms require at least partial_percent to match
                    if ((match_count / reply.search.length) > this.partial_percent) {
                        response = reply.response;
                    }
                } else if (reply.search_type === 'any') { // search terms require at least one match
                    if (match_count > 0) {
                        response = reply.response;
                    }
                }

                match_count = 0; // no matches per search terms, reset counter
            });

            return response;
        } else {
            // No valid response, reply was to somebody else in
            // the replies, or not on a tracked tweet
            return false;
        }
    }

    /**
     * Returns a score of what the incoming tweet's
     * relevance is to the consumer. A two would be
     * a complete match of both the correct account
     * response to id, and status response to id.
     * 
     * @param {String} in_reply_to_user_id_str from the twitter api response obj
     * @param {String} in_reply_to_status_id_str from the twitter api response obj
     * 
     * @returns {number} the relevance score
     */
    checkTweetRelevance(in_reply_to_user_id_str, in_reply_to_status_id_str) {
        let relevance_score = 0;
        this.cache.data.forEach(data => {
            if (in_reply_to_user_id_str === data.account.id) relevance_score++;
            data.tweets.forEach(tweet => {
                if (in_reply_to_status_id_str === tweet.id) relevance_score++;
            });
        });

        return relevance_score;
    }


    // Methods
    ///////////////////////////////
    /**
     * Create a connection to mongodb. Should
     * always be called first. Not in the constructor
     * because I'd rather not have a callback there.
     * 
     * @param {function} cb callback
     */
    createConnection(cb) {
        this.useDB(this.setupDB, cb);
    }

    /**
     * Connect to the mongodb and execute a function.
     * Callback will always contain db.close().
     * 
     * @param {function} exec function to execute, must take self, db, and cb params
     * @param {function} cb callback
     */
    useDB(exec, cb) {
        let exec_func = function(err, db) {
            if (err) cb(err);
            exec(this, db, () => {
                db.close();
                cb();
            });
        }.bind(this); // may be unecessary if i use () => {}

        this.M.connect(this.mongo_uri, exec_func);
    }

    /**
     * Setup the database with any relevant data
     * and collections.
     * 
     * @param {Object} self this object from class root (bind wasn't working :/)
     * @param {Object} db database object from mongodb client connection
     * @param {function} cb callback function to execute
     */
    setupDB(self, db, cb) {
        db.listCollections({name: self.coll_name})
            .next((err, coll_name) => {
                if (coll_name) {
                    // Collection exists
                    const coll = db.collection(self.coll_name);
                    coll.find({}).toArray((err, res) => {
                        if (err) {
                            cb();
                            throw err;
                        } else {
                            self.cacheData(self, res, cb);
                        }
                    });
                } else {
                    // Collection doesn't exist, create one
                    db.createCollection(self.coll_name, (err, res) => {
                        if (err) {
                            cb();
                            throw err;
                        } else {
                            cb();
                        }
                    });
                }
            });
    }

    /**
     * Add data into a cache object, indexed by
     * collection name.
     * 
     * @param {Array} data from a mongo query
     * @param {function} cb
     */
    cacheData(self, data, cb) {
        self.cache['meta']['retrieved'] = new Date();
        self.cache['data'] = data;
        cb();
    }

    /**
     * Refresh the cache with new data from db
     * 
     * @param {function} cb callback
     */
    refreshCache(cb) {
        this.useDB((self, db, cb) => {
            const coll = db.collection(self.coll_name);
            coll.find({}).toArray((err, res) => {
                if (err) {
                    cb();
                    throw err;
                } else {
                    self.cacheData(self, res, cb);
                }
            });
        }, cb);
    }

    strSimilarity(s1, s2) {
        var longer = s1;
        var shorter = s2;
        if (s1.length < s2.length) {
            longer = s2;
            shorter = s1;
        }
        var longerLength = longer.length;
        if (longerLength == 0) {
            return 1.0;
        }

        return (longerLength - this.strEditDistance(longer, shorter)) / parseFloat(longerLength);
    }

    strEditDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
      
        var costs = new Array();
        for (var i = 0; i <= s1.length; i++) {
            var lastValue = i;
            for (var j = 0; j <= s2.length; j++) {
                if (i == 0)
                costs[j] = j;
                else {
                    if (j > 0) {
                        var newValue = costs[j - 1];
                        if (s1.charAt(i - 1) != s2.charAt(j - 1))
                            newValue = Math.min(Math.min(newValue, lastValue),
                                costs[j]) + 1;
                            costs[j - 1] = lastValue;
                            lastValue = newValue;
                    }
                }
            }

            if (i > 0)
                costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }
}

module.exports = TwitterConsumer;