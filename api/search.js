export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { handle } = req.query;
    const API_KEY = process.env.YOUTUBE_API_KEY; 

    if (!handle) {
        return res.status(400).json({ error: 'Missing channel handle' });
    }

    try {
        let channelId = null;
        let uploadsPlaylistId = null;
        const formattedHandle = handle.startsWith('@') ? handle.trim() : `@${handle.trim()}`;

        // 1. Fetch channel details to get the master Uploads Playlist ID
        const channelUrl = `https://www.googleapis.com/youtube/v3/channels?key=${API_KEY}&forHandle=${encodeURIComponent(formattedHandle)}&part=id,contentDetails`;
        const channelRes = await fetch(channelUrl);
        const channelData = await channelRes.json();

        if (channelData.items && channelData.items.length > 0) {
            channelId = channelData.items[0].id;
            uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
        } else {
            // Fallback Search to get Channel ID if handle resolution fails
            const fallbackSearchUrl = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&q=${encodeURIComponent(handle)}&type=channel&part=id&maxResults=1`;
            const fallbackRes = await fetch(fallbackSearchUrl);
            const fallbackData = await fallbackRes.json();

            if (fallbackData.items && fallbackData.items.length > 0) {
                channelId = fallbackData.items[0].id.channelId;
                
                // Get the uploads playlist for the fallback channel ID
                const fallbackChannelUrl = `https://www.googleapis.com/youtube/v3/channels?key=${API_KEY}&id=${channelId}&part=contentDetails`;
                const fbChanRes = await fetch(fallbackChannelUrl);
                const fbChanData = await fbChanRes.json();
                if (fbChanData.items && fbChanData.items.length > 0) {
                    uploadsPlaylistId = fbChanData.items[0].contentDetails.relatedPlaylists.uploads;
                }
            }
        }

        if (!uploadsPlaylistId) {
            return res.status(404).json({ error: 'Channel or uploads index not found.' });
        }

        // 2. Fetch the latest 50 videos directly out of the Master Uploads Playlist (Guarantees comprehensive cataloging)
        const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${uploadsPlaylistId}&part=contentDetails,snippet&maxResults=50`;
        const playlistRes = await fetch(playlistUrl);
        const playlistData = await playlistRes.json();

        if (!playlistData.items || playlistData.items.length === 0) {
            return res.status(200).json({ longVideos: [], shortVideos: [] });
        }

        const videoIds = playlistData.items.map(item => item.contentDetails.videoId).join(',');

        // 3. Request statistical details (views & duration metrics) directly for these 50 videos
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=contentDetails,snippet,statistics`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        let allVideos = [];

        if (detailsData.items) {
            detailsData.items.forEach(video => {
                const duration = video.contentDetails.duration;
                const isShort = !duration.includes('M') && !duration.includes('H');
                const views = parseInt(video.statistics?.viewCount || 0, 10);

                allVideos.push({
                    title: video.snippet.title,
                    id: video.id,
                    isShort: isShort,
                    views: views
                });
            });
        }

        // 4. Sort the compiled list locally using math array filtering on raw views data descending
        // This guarantees that the genuine top-viewed items float to the top
        const sortedLongVideos = allVideos
            .filter(v => !v.isShort)
            .sort((a, b) => b.views - a.views)
            .slice(0, 3);

        const sortedShortVideos = allVideos
            .filter(v => v.isShort)
            .sort((a, b) => b.views - a.views)
            .slice(0, 3);

        return res.status(200).json({ longVideos: sortedLongVideos, shortVideos: sortedShortVideos });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to accurately sort channel performance assets.' });
    }
}
