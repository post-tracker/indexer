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

    // Normalize an account identifier (SteamID64 or vanity) to a SteamID64 so
    // it can be compared against the SteamID64 derived from a forum post's
    // miniprofile. Numeric identifiers are already SteamID64s; vanity names are
    // resolved via the profile XML (same cached document as resolvePersonaName).
    static async resolveSteamId64 ( userIdentifier, load ) {
        if ( /^\d+$/.test( userIdentifier ) ) {
            return userIdentifier;
        }

        let profileXml = false;

        try {
            profileXml = await load.get( `https://steamcommunity.com/id/${ userIdentifier }/?xml=1` );
        } catch ( profileLoadError ) {
            console.error( `[SteamFeed] failed to load profile for ${ userIdentifier }: ${ profileLoadError.message }` );
        }

        if ( !profileXml ) {
            return false;
        }

        const match = profileXml.match( /<steamID64>([0-9]+)<\/steamID64>/ );

        return match ? match[ 1 ] : false;
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

        // Official announcements are sometimes group/store-attributed to a
        // persona that has no Steam profile (e.g. Satisfactory's "css_uzu"),
        // so the profile lookup returns nothing. Fall back to matching the feed
        // author against the configured identifier directly. A numeric
        // SteamID64 identifier never equals a persona name, so this fallback
        // can't produce false matches for normal accounts.
        const matchName = ( personaName || this.userId ).trim().toLowerCase();
        const validPosts = [];

        for ( let i = 0; i < posts.length; i = i + 1 ) {
            if ( !posts[ i ].author || posts[ i ].author.trim().toLowerCase() !== matchName ) {
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
