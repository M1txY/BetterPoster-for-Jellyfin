using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.BtttrPosters.Configuration
{
    public class PluginConfiguration : BasePluginConfiguration
    {
        public string LayoutStyle { get; set; } = "poster-default";

        public bool FallbackToTmdbText { get; set; } = true;

        /// <summary>
        /// Base URL of the self-hosted Better Poster service (e.g. http://192.168.1.50:8080).
        /// When empty, the plugin falls back to fetching directly from btttr.cc (no quality badge).
        /// </summary>
        public string PosterServiceUrl { get; set; } = string.Empty;

        /// <summary>
        /// Overlay a resolution badge (4K / 1080p / 720p / SD) based on the real local file.
        /// </summary>
        public bool EnableQualityTags { get; set; } = true;

        /// <summary>
        /// Overlay an HDR / Dolby Vision badge when the file's dynamic range reports it.
        /// </summary>
        public bool EnableHdrTags { get; set; } = true;
    }
}
