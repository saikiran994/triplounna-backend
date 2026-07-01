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
        let channelId = null;
        const cleanHandle = handle.replace('@', '').trim();

        // Method A: Attempt strict handle resolution
        const channelUrl = `https://www.googleapis.com/youtube/v3/channels?key=${API_KEY}&forHandle=${cleanHandle}&part=id`;
        const channelRes = await fetch(channelUrl);
        const channelData = await channelRes.json();

        if (channelData.items && channelData.items.length > 0) {
            channelId = channelData.items[0].id;
        } else {
            // Method B Fallback: Plain keyword search to locate the channel ID dynamically
            const fallbackSearchUrl = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&q=${encodeURIComponent(cleanHandle)}&type=channel&part=id&maxResults=1`;
            const fallbackRes = await fetch(fallbackSearchUrl);
            const fallbackData = await fallbackRes.json();

            if (fallbackData.items && fallbackData.items.length > 0) {
                channelId = fallbackData.items[0].id.channelId;
            }
        }

        // If both methods fail, return the error safely
        if (!channelId) {
            return res.status(404).json({ error: 'Channel not found. Please double-check the handle or spelling.' });
        }

        // 2. Fetch latest videos from the resolved channel ID
        const videosUrl = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${channelId}&part=id,snippet&order=date&maxResults=50&type=video`;
        const videosRes = await fetch(videosUrl);
        const videosData = await videosRes.json();

        if (!videosData.items) {
            return res.status(200).json({ longVideos: [], shortVideos: [] });
        }

        // 3. Gather full detail definitions to separate long vs short format aspect ratios
        const videoIds = videosData.items.map(item => item.id.videoId).filter(id => id).join(',');
        
        if (!videoIds) {
            return res.status(200).json({ longVideos: [], shortVideos: [] });
        }

        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=contentDetails,snippet`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        const longVideos = [];
        const shortVideos = [];

        if (detailsData.items) {
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
        }

        return res.status(200).json({ longVideos, shortVideos });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch live YouTube data assets.' });
    }
}
