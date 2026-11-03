// src/settings.ts

export type GlobalSettings = {
    solidtimeBaseUrl?: string;
    accessToken?: string;
    askStopReason?: boolean; // show a popup asking for the reason when a timer is stopped (default: true)
    stopReasons?: string; // predefined reasons for the popup, one per line
};

// We will add Action-specific settings here later.
export type ActionSettings = {
    organizationId?: string;
    projectId?: string;
    billable?: boolean;
    showElapsedTime?: boolean;
    titleOverride?: string;
    tagIds?: string[]; // selected tag IDs (multi-select)
    description?: string; // optional description for time entry
    runningColor?: string; // key background while the timer is running ("#rrggbb")
};
