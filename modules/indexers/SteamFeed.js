const RSS = require( './RSS.js' );

class SteamFeed extends RSS {
    constructor ( userIdentifier, providerConfig, load  ) {
        if ( !providerConfig.allowedSections[ 0 ] ) {
            return false;
        }

        providerConfig.endpoint = `https://steamcommunity.com/games/${ providerConfig.allowedSections[ 0 ] }/rss/`;
        super( userIdentifier, providerConfig, load );

        this.userId = userIdentifier;
        this.section = providerConfig.allowedSections[ 0 ];
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
            if ( posts[ i ].author !== this.userId ) {
                continue;
            }

            posts[ i ].topicUrl = posts[ i ].url;
            posts[ i ].section = this.section;
            validPosts.push( posts[ i ] );
        }

        return validPosts;
    }
}

module.exports = SteamFeed;
