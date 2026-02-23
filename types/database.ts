export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SeasonType = 'regular' | 'playoffs';
export type GameStatus = 'scheduled' | 'live' | 'final';
export type WatchMode = 'live' | 'replay' | 'condensed' | 'highlights';

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          user_id: string;
          display_name: string;
          handle: string;
          bio: string | null;
          avatar_url: string | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name: string;
          handle: string;
          bio?: string | null;
          avatar_url?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          handle?: string;
          bio?: string | null;
          avatar_url?: string | null;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
      };
      follows: {
        Row: {
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      teams: {
        Row: {
          id: string;
          provider: string;
          provider_team_id: number;
          abbreviation: string;
          city: string;
          conference: string | null;
          division: string | null;
          full_name: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider?: string;
          provider_team_id: number;
          abbreviation: string;
          city: string;
          conference?: string | null;
          division?: string | null;
          full_name: string;
          name: string;
          created_at?: string;
        };
        Update: {
          abbreviation?: string;
          city?: string;
          conference?: string | null;
          division?: string | null;
          full_name?: string;
          name?: string;
        };
      };
      players: {
        Row: {
          id: string;
          provider: string;
          provider_player_id: number;
          first_name: string;
          last_name: string;
          position: string | null;
          jersey_number: string | null;
          team_id: string | null;
          height: string | null;
          weight: string | null;
          college: string | null;
          country: string | null;
          draft_year: number | null;
          draft_round: number | null;
          draft_number: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider?: string;
          provider_player_id: number;
          first_name: string;
          last_name: string;
          position?: string | null;
          jersey_number?: string | null;
          team_id?: string | null;
          height?: string | null;
          weight?: string | null;
          college?: string | null;
          country?: string | null;
          draft_year?: number | null;
          draft_round?: number | null;
          draft_number?: number | null;
        };
        Update: {
          position?: string | null;
          jersey_number?: string | null;
          team_id?: string | null;
          updated_at?: string;
        };
      };
      seasons: {
        Row: {
          id: string;
          year: number;
          type: SeasonType;
          created_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          type?: SeasonType;
          created_at?: string;
        };
        Update: {
          type?: SeasonType;
        };
      };
      games: {
        Row: {
          id: string;
          provider: string;
          provider_game_id: number;
          season_id: string;
          home_team_id: string;
          away_team_id: string;
          home_team_score: number | null;
          away_team_score: number | null;
          game_date_utc: string;
          status: GameStatus;
          period: number | null;
          time: string | null;
          postseason: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider?: string;
          provider_game_id: number;
          season_id: string;
          home_team_id: string;
          away_team_id: string;
          home_team_score?: number | null;
          away_team_score?: number | null;
          game_date_utc: string;
          status?: GameStatus;
          period?: number | null;
          time?: string | null;
          postseason?: boolean;
        };
        Update: {
          home_team_score?: number | null;
          away_team_score?: number | null;
          status?: GameStatus;
          period?: number | null;
          time?: string | null;
          updated_at?: string;
        };
      };
      game_logs: {
        Row: {
          id: string;
          user_id: string;
          game_id: string;
          rating: number | null;
          watch_mode: WatchMode | null;
          review: string | null;
          has_spoilers: boolean;
          logged_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_id: string;
          rating?: number | null;
          watch_mode?: WatchMode | null;
          review?: string | null;
          has_spoilers?: boolean;
          logged_at?: string;
          updated_at?: string;
        };
        Update: {
          rating?: number | null;
          watch_mode?: WatchMode | null;
          review?: string | null;
          has_spoilers?: boolean;
          updated_at?: string;
        };
      };
      log_tags: {
        Row: {
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          name?: string;
          slug?: string;
        };
      };
      game_log_tag_map: {
        Row: {
          log_id: string;
          tag_id: string;
        };
        Insert: {
          log_id: string;
          tag_id: string;
        };
        Update: Record<string, never>;
      };
      likes: {
        Row: {
          user_id: string;
          log_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          log_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      lists: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          is_private: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          is_private?: boolean;
        };
        Update: {
          title?: string;
          description?: string | null;
          is_private?: boolean;
          updated_at?: string;
        };
      };
      list_items: {
        Row: {
          id: string;
          list_id: string;
          game_id: string;
          position: number;
          note: string | null;
          added_at: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          game_id: string;
          position?: number;
          note?: string | null;
        };
        Update: {
          position?: number;
          note?: string | null;
        };
      };
      user_favorite_teams: {
        Row: {
          user_id: string;
          team_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          team_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      comments: {
        Row: {
          id: string;
          user_id: string;
          log_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          log_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          body?: string;
        };
      };
      user_favorite_players: {
        Row: {
          user_id: string;
          player_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          player_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      season_type: SeasonType;
      game_status: GameStatus;
      watch_mode: WatchMode;
    };
  };
}

// Convenience row types
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type Follow = Database['public']['Tables']['follows']['Row'];
export type Team = Database['public']['Tables']['teams']['Row'];
export type Player = Database['public']['Tables']['players']['Row'];
export type Season = Database['public']['Tables']['seasons']['Row'];
export type Game = Database['public']['Tables']['games']['Row'];
export type GameLog = Database['public']['Tables']['game_logs']['Row'];
export type LogTag = Database['public']['Tables']['log_tags']['Row'];
export type Like = Database['public']['Tables']['likes']['Row'];
export type Comment = Database['public']['Tables']['comments']['Row'];
export type List = Database['public']['Tables']['lists']['Row'];
export type ListItem = Database['public']['Tables']['list_items']['Row'];

// Joined types used in UI
export type GameWithTeams = Game & {
  home_team: Team;
  away_team: Team;
  season: Season;
};

export type GameLogWithGame = GameLog & {
  game: GameWithTeams;
  user_profile?: UserProfile;
  like_count?: number;
  liked_by_me?: boolean;
  tags?: LogTag[];
  comment_count?: number;
};
