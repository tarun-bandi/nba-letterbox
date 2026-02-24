export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Sport = 'nba' | 'nfl';
export type SeasonType = 'regular' | 'playoffs';
export type GameStatus = 'scheduled' | 'live' | 'final';
export type WatchMode = 'live' | 'replay' | 'condensed' | 'highlights';
export type ReactionType = 'like' | 'fire' | 'ice' | 'skull' | 'mind_blown' | 'respect';

export interface PeriodScores {
  home: number[];
  away: number[];
  ot: { home: number; away: number }[];
}

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
          enabled_sports: Sport[];
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
          enabled_sports?: Sport[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          handle?: string;
          bio?: string | null;
          avatar_url?: string | null;
          onboarding_completed?: boolean;
          enabled_sports?: Sport[];
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
          sport: Sport;
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
          sport?: Sport;
          created_at?: string;
        };
        Update: {
          abbreviation?: string;
          city?: string;
          conference?: string | null;
          division?: string | null;
          full_name?: string;
          name?: string;
          sport?: Sport;
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
          headshot_url: string | null;
          sport: Sport;
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
          headshot_url?: string | null;
          sport?: Sport;
        };
        Update: {
          position?: string | null;
          jersey_number?: string | null;
          team_id?: string | null;
          headshot_url?: string | null;
          sport?: Sport;
          updated_at?: string;
        };
      };
      seasons: {
        Row: {
          id: string;
          year: number;
          type: SeasonType;
          sport: Sport;
          created_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          type?: SeasonType;
          sport?: Sport;
          created_at?: string;
        };
        Update: {
          type?: SeasonType;
          sport?: Sport;
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
          playoff_round: string | null;
          sport: Sport;
          period_scores: PeriodScores | null;
          home_q1: number | null;
          home_q2: number | null;
          home_q3: number | null;
          home_q4: number | null;
          home_ot: number | null;
          away_q1: number | null;
          away_q2: number | null;
          away_q3: number | null;
          away_q4: number | null;
          away_ot: number | null;
          arena: string | null;
          attendance: number | null;
          highlights_url: string | null;
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
          playoff_round?: string | null;
          sport?: Sport;
          period_scores?: PeriodScores | null;
          home_q1?: number | null;
          home_q2?: number | null;
          home_q3?: number | null;
          home_q4?: number | null;
          home_ot?: number | null;
          away_q1?: number | null;
          away_q2?: number | null;
          away_q3?: number | null;
          away_q4?: number | null;
          away_ot?: number | null;
          arena?: string | null;
          attendance?: number | null;
          highlights_url?: string | null;
        };
        Update: {
          home_team_score?: number | null;
          away_team_score?: number | null;
          status?: GameStatus;
          period?: number | null;
          time?: string | null;
          sport?: Sport;
          period_scores?: PeriodScores | null;
          home_q1?: number | null;
          home_q2?: number | null;
          home_q3?: number | null;
          home_q4?: number | null;
          home_ot?: number | null;
          away_q1?: number | null;
          away_q2?: number | null;
          away_q3?: number | null;
          away_q4?: number | null;
          away_ot?: number | null;
          arena?: string | null;
          attendance?: number | null;
          highlights_url?: string | null;
          playoff_round?: string | null;
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
          reaction_type: ReactionType;
          created_at: string;
        };
        Insert: {
          user_id: string;
          log_id: string;
          reaction_type?: ReactionType;
          created_at?: string;
        };
        Update: {
          reaction_type?: ReactionType;
        };
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
      watchlist: {
        Row: {
          user_id: string;
          game_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          game_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      box_scores: {
        Row: {
          id: string;
          game_id: string;
          team_id: string;
          player_name: string;
          sport: Sport;
          stats: Record<string, any> | null;
          minutes: string | null;
          points: number | null;
          rebounds: number | null;
          offensive_rebounds: number | null;
          defensive_rebounds: number | null;
          assists: number | null;
          steals: number | null;
          blocks: number | null;
          turnovers: number | null;
          fgm: number | null;
          fga: number | null;
          fg_pct: number | null;
          tpm: number | null;
          tpa: number | null;
          tp_pct: number | null;
          ftm: number | null;
          fta: number | null;
          ft_pct: number | null;
          personal_fouls: number | null;
          plus_minus: number | null;
          ts_pct: number | null;
          efg_pct: number | null;
          three_par: number | null;
          ft_rate: number | null;
          orb_pct: number | null;
          drb_pct: number | null;
          trb_pct: number | null;
          ast_pct: number | null;
          stl_pct: number | null;
          blk_pct: number | null;
          tov_pct: number | null;
          usg_pct: number | null;
          offensive_rating: number | null;
          defensive_rating: number | null;
          bpm: number | null;
          starter: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          team_id: string;
          player_name: string;
          sport?: Sport;
          stats?: Record<string, any> | null;
          minutes?: string | null;
          points?: number | null;
          rebounds?: number | null;
          offensive_rebounds?: number | null;
          defensive_rebounds?: number | null;
          assists?: number | null;
          steals?: number | null;
          blocks?: number | null;
          turnovers?: number | null;
          fgm?: number | null;
          fga?: number | null;
          fg_pct?: number | null;
          tpm?: number | null;
          tpa?: number | null;
          tp_pct?: number | null;
          ftm?: number | null;
          fta?: number | null;
          ft_pct?: number | null;
          personal_fouls?: number | null;
          plus_minus?: number | null;
          ts_pct?: number | null;
          efg_pct?: number | null;
          three_par?: number | null;
          ft_rate?: number | null;
          orb_pct?: number | null;
          drb_pct?: number | null;
          trb_pct?: number | null;
          ast_pct?: number | null;
          stl_pct?: number | null;
          blk_pct?: number | null;
          tov_pct?: number | null;
          usg_pct?: number | null;
          offensive_rating?: number | null;
          defensive_rating?: number | null;
          bpm?: number | null;
          starter?: boolean;
        };
        Update: Record<string, never>;
      };
      game_predictions: {
        Row: {
          user_id: string;
          game_id: string;
          predicted_winner_team_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          game_id: string;
          predicted_winner_team_id: string;
          created_at?: string;
        };
        Update: {
          predicted_winner_team_id?: string;
        };
      };
      push_tokens: {
        Row: {
          user_id: string;
          token: string;
          platform: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          token: string;
          platform: string;
          updated_at?: string;
        };
        Update: {
          updated_at?: string;
        };
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
export type BoxScore = Database['public']['Tables']['box_scores']['Row'];
export type Watchlist = Database['public']['Tables']['watchlist']['Row'];
export type FavoritePlayer = Database['public']['Tables']['user_favorite_players']['Row'];

// Joined types used in UI
export type GameWithTeams = Game & {
  home_team: Team;
  away_team: Team;
  season: Season;
};

export type GamePrediction = Database['public']['Tables']['game_predictions']['Row'];
export type PushToken = Database['public']['Tables']['push_tokens']['Row'];

export type GameLogWithGame = GameLog & {
  game: GameWithTeams;
  user_profile?: UserProfile;
  like_count?: number;
  liked_by_me?: boolean;
  reactions?: Record<ReactionType, number>;
  my_reaction?: ReactionType | null;
  tags?: LogTag[];
  comment_count?: number;
};
