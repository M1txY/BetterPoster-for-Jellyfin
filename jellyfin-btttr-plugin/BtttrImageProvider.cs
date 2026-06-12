using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Providers;
using Microsoft.Extensions.Logging;
using Jellyfin.Plugin.BtttrPosters.Configuration;

namespace Jellyfin.Plugin.BtttrPosters
{
    public class BtttrImageProvider : IRemoteImageProvider, IHasOrder
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<BtttrImageProvider> _logger;

        public BtttrImageProvider(IHttpClientFactory httpClientFactory, ILogger<BtttrImageProvider> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        public string Name => "Btttr Posters";

        public int Order => 0; // Highest priority - displays as the first choice

        public bool Supports(BaseItem item)
        {
            // Only movies and series (TV Shows) support custom poster overlays
            return item is Movie || item is Series;
        }

        public IEnumerable<ImageType> GetSupportedImages(BaseItem item)
        {
            return new[] { ImageType.Primary };
        }

        public Task<IEnumerable<RemoteImageInfo>> GetImages(BaseItem item, CancellationToken cancellationToken)
        {
            var images = new List<RemoteImageInfo>();

            // Extract the IMDb Identifier from Jellyfin's metadata item links
            string? imdbId = item.GetProviderId(MetadataProvider.Imdb);

            _logger.LogInformation("Processing Btttr Image Provider for item: {Name}", item.Name);

            if (string.IsNullOrEmpty(imdbId))
            {
                _logger.LogWarning("Btttr Image Provider: IMDB ID not found for item: {Name}. Cannot fetch custom poster.", item.Name);
                return Task.FromResult<IEnumerable<RemoteImageInfo>>(images);
            }

            // Ensure IMDb ID starts with "tt" (normal IMDb format, e.g., tt10919420)
            if (!imdbId.StartsWith("tt", StringComparison.OrdinalIgnoreCase))
            {
                imdbId = "tt" + imdbId;
            }

            var config = Plugin.Instance?.Configuration;
            var layout = config?.LayoutStyle ?? "poster-default";
            var serviceBase = config?.PosterServiceUrl?.Trim().TrimEnd('/') ?? string.Empty;

            string posterUrl;
            if (string.IsNullOrEmpty(serviceBase))
            {
                // No self-hosted service configured -> original behaviour: fetch straight from btttr.cc.
                posterUrl = $"https://btttr.cc/poster/imdb/{layout}/{imdbId}.jpg";
                _logger.LogInformation("Btttr direct mode (no service URL set). URL: {Url}", posterUrl);
            }
            else
            {
                // Self-hosted service: it pulls a clean poster from btttr.cc and overlays the
                // quality badges we compute here from the REAL local file.
                var query = BuildQualityQuery(item, config!);
                posterUrl = $"{serviceBase}/poster/{imdbId}.jpg{query}";
                _logger.LogInformation("Btttr service mode for {Name}. URL: {Url}", item.Name, posterUrl);
            }

            images.Add(new RemoteImageInfo
            {
                ProviderName = Name,
                Url = posterUrl,
                ThumbnailUrl = posterUrl,
                Type = ImageType.Primary
            });

            return Task.FromResult<IEnumerable<RemoteImageInfo>>(images);
        }

        public Task<HttpResponseMessage> GetImageResponse(string url, CancellationToken cancellationToken)
        {
            _logger.LogInformation("Fetching custom poster: {Url}", url);
            var client = _httpClientFactory.CreateClient(Name);
            return client.GetAsync(url, cancellationToken);
        }

        // --- Quality detection -------------------------------------------------

        private string BuildQualityQuery(BaseItem item, PluginConfiguration config)
        {
            var parts = new List<string>();
            var videoStream = GetPrimaryVideoStream(item);

            if (config.EnableQualityTags)
            {
                var quality = GetResolutionTag(videoStream);
                if (!string.IsNullOrEmpty(quality))
                {
                    parts.Add("quality=" + quality);
                }
            }

            if (config.EnableHdrTags && videoStream != null)
            {
                var hdr = GetHdrTag(videoStream);
                if (!string.IsNullOrEmpty(hdr))
                {
                    parts.Add("hdr=" + hdr);
                }
            }

            _logger.LogInformation(
                "Detected quality for {Name}: {Tags}",
                item.Name,
                parts.Count > 0 ? string.Join(", ", parts) : "(none)");

            return parts.Count > 0 ? "?" + string.Join("&", parts) : string.Empty;
        }

        private static string GetResolutionTag(MediaStream? videoStream)
        {
            if (videoStream == null)
            {
                return string.Empty;
            }

            int w = videoStream.Width ?? 0;
            int h = videoStream.Height ?? 0;

            // Prefer width: cinematic 4K/1080p use varying heights (2.39:1, 1.85:1, ...).
            if (w >= 3000 || h >= 2000) return "4k";
            if (w >= 1700 || h >= 950) return "1080p";
            if (w >= 1100 || h >= 650) return "720p";
            if (w > 0 || h > 0) return "sd";
            return string.Empty;
        }

        private static string GetHdrTag(MediaStream videoStream)
        {
            // VideoRangeType reports the precise dynamic range (DOVI, HDR10, HDR10Plus, HLG, SDR...).
            var rangeType = videoStream.VideoRangeType.ToString().ToUpperInvariant();
            if (rangeType.Contains("DOVI") || rangeType.Contains("DOLBY"))
            {
                return "dv";
            }
            if (rangeType.Contains("HDR") || rangeType.Contains("HLG"))
            {
                return "hdr";
            }
            return string.Empty;
        }

        private static MediaStream? GetPrimaryVideoStream(BaseItem item)
        {
            // Movies (and other Video items) expose their streams directly.
            var direct = GetMediaStreamsSafe(item).FirstOrDefault(s => s.Type == MediaStreamType.Video);
            if (direct != null)
            {
                return direct;
            }

            // A Series has no media of its own -> sample the first episode that does.
            if (item is Series series)
            {
                foreach (var episode in series.GetRecursiveChildren().OfType<Episode>())
                {
                    var epVideo = GetMediaStreamsSafe(episode).FirstOrDefault(s => s.Type == MediaStreamType.Video);
                    if (epVideo != null)
                    {
                        return epVideo;
                    }
                }
            }

            return null;
        }

        private static IReadOnlyList<MediaStream> GetMediaStreamsSafe(BaseItem item)
        {
            var streams = item.GetMediaStreams();
            return streams ?? (IReadOnlyList<MediaStream>)new List<MediaStream>();
        }
    }
}
