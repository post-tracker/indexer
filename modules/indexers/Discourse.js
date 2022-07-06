const moment = require( 'moment' );
const { URL } = require( 'url' );

const Post = require( '../Post.js' );

class Discourse {
    constructor ( userId, indexerConfig, load ) {
        this.endpoint = indexerConfig.endpoint;
        this.profileBase = '/user_actions.json?filter=4,5&username=';

        this.userId = userId;
        this.load = load;
    }

    async loadRecentPosts () {
        const url = new URL( `${ this.endpoint }${ this.profileBase }${ this.userId.toLowerCase() }` );
        const posts = [];
        let pagePosts = false;

        try {
            const page = await this.load.get( url.toString() );
            pagePosts = JSON.parse( page );

            if ( !pagePosts ) {
                console.error( `Failed to load ${ url.toString() }` );

                return posts;
            }
        } catch ( pageLoadError ) {
            console.error( pageLoadError );

            return posts;
        }

        for ( const forumPost of pagePosts.user_actions ) {
            const post = new Post();

            // If we have an action_code it's probably a post that got pinned or locked
            if ( forumPost.action_code ) {
                continue;
            }

            post.section = forumPost.category_id.toString();
            post.topicTitle = forumPost.title;
            post.topicUrl = `${ url.origin }/t/${ forumPost.slug }/${ forumPost.topic_id }`;
            post.url = `${ post.topicUrl }${ forumPost.post_number }`;
            post.timestamp = moment( forumPost.created_at ).unix();

            if ( forumPost.truncated ) {
                const postUrl = `${ url.origin }/posts/by_number/${ forumPost.topic_id }/${ forumPost.post_number }.json`;
                let fullPost = false;

                try {
                    const page = await this.load.get( postUrl, {
                        permanent: true,
                    } );
                    fullPost = JSON.parse( page );
                } catch ( pageLoadError ) {
                    console.error( pageLoadError );

                    continue;
                }

                post.text = fullPost.cooked;
            } else {
                post.text = forumPost.excerpt;
            }

            posts.push( post );
        }

        return posts;
    }
}

module.exports = Discourse;
