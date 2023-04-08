const RSS = require( './RSS.js' );

class CommLink extends RSS {
    constructor ( userId, indexerConfig, load ) {
        super( userId, indexerConfig, load );

        this.userId = userId;
    }

    async loadRecentPosts () {
        let posts = false;

        try {
            posts = await super.loadRecentPosts();
        } catch ( postLoadError ) {
            console.error( postLoadError );
        }

        const validPosts = [];

        for ( let i = 0; i < posts.length; i = i + 1 ) {
            posts[ i ].section = '';
            posts[ i ].topicTitle = posts[ i ].topicTitle;
            posts[ i ].topicUrl = posts[ i ].url;

            validPosts.push( posts[ i ] );
        }

        return validPosts;
    }
}

module.exports = CommLink;
