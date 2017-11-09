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
        }.bind(this);

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
                    coll.find({deleted: false}).toArray((err, res) => {
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
            coll.find({deleted: false}).toArray((err, res) => {
                if (err) {
                    cb();
                    throw err;
                } else {
                    self.cacheData(self, res, cb);
                }
            });
        }, cb);
    }
}

module.exports = TwitterConsumer;