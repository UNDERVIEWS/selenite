const Twitter = require('twitter');
const TwitterConsumer = require('./TwitterConsumer.js');
//const express = require('express');
//const app = express();

const T = new Twitter({
    consumer_key: process.env.C_KEY,
    consumer_secret: process.env.C_SEC,
    access_token_key: process.env.AT_KEY,
    access_token_secret: process.env.AT_SEC
});

const C = new TwitterConsumer(process.env.MONGO);
C.createConnection(() => {
    let acc_ids = C.getFollowedAccIds();
    T.stream('statuses/filter', {follow: acc_ids}, (stream) => {
        console.log(`Started status monitor stream on ids: ${acc_ids}`);
        stream.on('data', (event) => {
            if (typeof event.id_str === 'string'
                && typeof event.text === 'string') {
                let response = C.getResponse(event);
                if (response !== false) {
                    // reply with response
                    T.post('statuses/update', {
                        status: `@${event.user.screen_name} ${response}`,
                        in_reply_to_status_id: event.id
                    },  (err, tweet, resp) => {
                        if(err) console.error(`Error on status post: ${err}`);
                        console.log(`Responded to ${event.user.screen_name}`);
                    });
                }
            }
        });
    
        stream.on('error', (err) => {
            throw err;
            //console.error(`Error on status stream: ${err}`);
        });
    });
});

/*const port = process.env.PORT || 3000;

app.use(express.static('public'))

app.post('/', (req, res) => {
    res.send('df');
});

app.listen(port, () => console.log(`\nApplication running @ http://127.0.0.1:${port}`));*/



/*T.get('search/tweets', {
    q: 'node.js',

    count: 15,
    result_type: 'popular',
    since_id: '924169088288673792'
}, (err, tweets, resp) => {
    if (err) console.error(err);
    else {
        let last_id;

        console.log('Found', tweets.statuses.length, 'possible candidates:\n');
        tweets.statuses.forEach(function(tweet) {
            console.log(
                tweet.user.name, '(', tweet.user.screen_name, '):',
                tweet.user.friends_count, 'following -', tweet.user.followers_count, 'followers');
            
            console.log('    ', tweet.text);
            console.log('    (', tweet.retweet_count, 'rts,', tweet.favorite_count, 'favs )\n\n');

            last_id = tweet.id_str;
        }, this);

        console.log('Last ID was:', last_id);
    }
});*/