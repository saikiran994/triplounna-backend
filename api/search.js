export default async function handler(req, res) {
    // Enable CORS so your GitHub frontend can talk to this backend safely
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
        // 1. Resolve the custom handle or name into a Channel ID
        const channelUrl = `https://www.googleapis.com/youtube/v3/channels?key=${API_KEY}&forHandle=${handle.replace('@', '')}&part=id,contentDetails`;
        const channelRes = await fetch(channelUrl);
        const channelData = await channelRes.json();

        if (!channelData.items || channelData.items.length === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const channelId = channelData.items[0].id;

        // 2. Fetch the latest 50 videos from that channel
        const videosUrl = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${channelId}&part=id,snippet&order=date&maxResults=50&type=video`;
        const videosRes = await fetch(videosUrl);
        const videosData = await videosRes.json();

        // 3. Separate into Long videos and Short videos based on duration details
        const videoIds = videosData.items.map(item => item.id.videoId).join(',');
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=contentDetails,snippet`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        const longVideos = [];
        const shortVideos = [];

        detailsData.items.forEach(video => {
            const duration = video.contentDetails.duration; // e.g., PT5M23S or PT34S
            const isShort = !duration.includes('M') && !duration.includes('H'); 

            const videoPayload = {
                title: video.snippet.title,
                id: video.id
            };

            if (isShort && shortVideos.length < 3) {
                shortVideos.push(videoPayload);
            } else if (!isShort && longVideos.length < 3) {
                longVideos.push(videoPayload);
            }
        });

        return res.status(200).json({ longVideos, shortVideos });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch YouTube data' });
    }
}
