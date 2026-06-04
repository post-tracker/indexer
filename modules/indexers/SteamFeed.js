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

    // The game RSS feed exposes posters by display name (e.g. "Mal"), but our
    // account identifier is a SteamID64 or vanity name. Resolve the account's
    // current persona name from its profile XML so we can match feed authors.
    static async resolvePersonaName ( userIdentifier, load ) {
        const profileUrl = /^\d+$/.test( userIdentifier )
            ? `https://steamcommunity.com/profiles/${ userIdentifier }/?xml=1`
            : `https://steamcommunity.com/id/${ userIdentifier }/?xml=1`;

        let profileXml = false;

        try {
            profileXml = await load.get( profileUrl );
        } catch ( profileLoadError ) {
            console.error( `[SteamFeed] failed to load profile ${ profileUrl }: ${ profileLoadError.message }` );
        }

        if ( !profileXml ) {
            return false;
        }

        const match = profileXml.match( /<steamID>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/steamID>/ );

        return match ? match[ 1 ].trim() : false;
    }

    async loadRecentPosts () {
        let posts = false;

        try {
            posts = await super.loadRecentPosts();
        } catch ( postLoadError ) {
            console.error( postLoadError );
        }

        if ( !posts ) {
            return [];
        }

        const personaName = await SteamFeed.resolvePersonaName( this.userId, this.load );

        if ( !personaName ) {
            console.warn( `[SteamFeed] could not resolve persona for ${ this.userId }, skipping ${ this.section }` );

            return [];
        }

        const normalizedPersona = personaName.toLowerCase();
        const validPosts = [];

        for ( let i = 0; i < posts.length; i = i + 1 ) {
            if ( !posts[ i ].author || posts[ i ].author.trim().toLowerCase() !== normalizedPersona ) {
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
