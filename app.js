const Twitter = require('twitter');

const T = new Twitter({
    consumer_key: process.env.C_KEY,
    consumer_secret: process.env.C_SEC,
    access_token_key: process.env.AT_KEY,
    access_token_secret: process.env.AT_SEC
});

T.get('search/tweets', {
    q: 'node.js',

    count: 15,
    result_type: 'mixed',
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
});