const moment = require( 'moment' );
const { URL } = require( 'url' );

const Post = require( '../Post.js' );

class Discourse {
    constructor ( userId, indexerConfig, load ) {
        this.endpoint = indexerConfig.endpoint;
        this.profileBase = '/posts.json';

        this.userId = userId;
        this.load = load;
    }

    async loadRecentPosts () {
        const url = new URL( `${ this.endpoint }${ this.profileBase }` );
        const posts = [];
        let pagePosts = false;

        try {
            const page = await this.load.get( url.toString() );
            pagePosts = JSON.parse( page );
            
            if ( !pagePosts ) {
                throw new Error( `Failed to load ${ url.toString() }` );
            }
        } catch ( pageLoadError ) {
            console.error( pageLoadError );

            return posts;
        }

        for ( const forumPost of pagePosts ) {
            const post = new Post();

            post.section = forumPost.category_id;
            post.topicTitle = forumPost.title;
            post.topicUrl = `${ url.origin }/t/${ forumPost.topic.slug }/${ forumPost.topic.id }`;
            post.url = `${ url.origin }${ forumPost.url }`;
            post.timestamp = moment( forumPost.created_at ).unix();

            if ( forumPost.truncated ) {
                const postUrl = `${ url.origin }/posts/by_number/${ forumPost.topic_id }/${ forumPost.post_number }.json`;
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
