const SteamFeed = require( './SteamFeed' );
const SteamDiscussions = require( './SteamDiscussions' );

// INDEXING ONLY. Untracked-dev/announcer DISCOVERY moved to the finder
// (finder/modules/finders/Steam.js) so Steam discovery lives in one service
// with one cross-game exclusion list — see that file. This class now purely
// indexes the posts of accounts already tracked for the game: announcements
// (SteamFeed) + developer-badged forum posts (SteamDiscussions), which are
// complementary sources, so a failure in one must not drop the other.
class Steam {
    constructor ( userIdentifier, providerConfig, load ) {
        this.feed = new SteamFeed( userIdentifier, providerConfig, load );
        this.discussions = new SteamDiscussions( userIdentifier, providerConfig, load );
        this.userIdentifier = userIdentifier;
    }

    async loadFromSource ( source ) {
        try {
            const posts = await source.loadRecentPosts();

            return posts || [];
        } catch ( sourceError ) {
            console.error( sourceError );

            return [];
        }
    }

    async loadRecentPosts () {
        const [ announcements, forumPosts ] = await Promise.all( [
            this.loadFromSource( this.feed ),
            this.loadFromSource( this.discussions ),
        ] );

        return announcements.concat( forumPosts );
    }
}

module.exports = Steam;
