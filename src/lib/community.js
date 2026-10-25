import { supabase } from './supabase';

const COMMUNITY_TABLE = 'community_recommendations';
const PAGE_LOAD_LIMIT = 100;

function requireSupabase() {
  if (!supabase) throw new Error('Community requires Supabase to be configured.');
  return supabase;
}

export async function getCommunityRecommendations({ sortBy = 'upvotes', userId = null, scenarioId = null, cardLevels = null } = {}) {
  const client = requireSupabase();
  let query = client
    .from(COMMUNITY_TABLE)
    .select(
      'id,user_id,title,body,card_levels,recommendations,upvote_count,created_at,updated_at,community_profiles!community_recommendations_user_id_fkey(display_name)',
      { count: 'exact' },
    )
    .eq('is_hidden', false);

  // Scope the feed to the exact six-card snapshot in all cases. A matching scenario
  // narrows it further, but an unmatched snapshot must never see other loadouts.
  if (scenarioId) query = query.eq('scenario_id', String(scenarioId));
  if (cardLevels && typeof cardLevels === 'object') {
    for (const [cardId, level] of Object.entries(cardLevels)) {
      if (level !== undefined && level !== null && String(cardId)) {
        // PostgREST supports JSON text selectors; comparing every core value
        // prevents posts for LB0 from appearing when the viewer selects LB2.
        query = query.eq(`card_levels->>${cardId}`, String(level));
      }
    }
  }

  if (sortBy === 'oldest') {
    query = query.order('created_at', { ascending: true });
  } else if (sortBy === 'newest') {
    query = query.order('created_at', { ascending: false });
  } else {
    query = query.order('upvote_count', { ascending: false }).order('created_at', { ascending: false });
  }
  query = query.range(0, PAGE_LOAD_LIMIT - 1);
  const { data, error, count } = await query;
  if (error) throw error;

  const posts = data || [];
  let votedIds = new Set();
  if (userId && posts.length) {
    const { data: votes, error: votesError } = await client
      .from('community_votes')
      .select('recommendation_id')
      .eq('user_id', userId)
      .in('recommendation_id', posts.map((post) => post.id));
    if (votesError) throw votesError;
    votedIds = new Set((votes || []).map((vote) => vote.recommendation_id));
  }

  return {
    posts: posts.map((post) => ({
      ...post,
      authorName: post.community_profiles?.display_name || `Player-${String(post.user_id || '').replaceAll('-', '').slice(0, 6) || 'Unknown'}`,
      hasUpvoted: votedIds.has(post.id),
    })),
    count: count ?? posts.length,
  };
}



export async function getMyCommunityRecommendations(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(COMMUNITY_TABLE)
    .select('id,user_id,title,body,card_levels,recommendations,upvote_count,created_at,updated_at,is_hidden')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function getCommunityProfileName(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('community_profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.display_name || null;
}

export async function updateCommunityProfileName(userId, displayName) {
  const client = requireSupabase();
  const normalizedName = String(displayName || '').trim().replace(/\s+/g, ' ');
  if (normalizedName.length < 2 || normalizedName.length > 32) {
    throw new Error('Display name must be between 2 and 32 characters.');
  }
  const { data, error } = await client
    .from('community_profiles')
    .update({ display_name: normalizedName, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('display_name')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Your Community profile could not be updated. Please sign out and sign in again.');
  return data.display_name;
}

export async function createCommunityRecommendation(payload, userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(COMMUNITY_TABLE)
    .insert({ ...payload, user_id: userId })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCommunityRecommendation(id, payload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(COMMUNITY_TABLE)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Changes were not saved. Make sure you own this recommendation.');
  return data;
}

export async function deleteCommunityRecommendation(id) {
  const client = requireSupabase();
  const { error, count } = await client
    .from(COMMUNITY_TABLE)
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw error;
  if (count === 0) throw new Error('The recommendation could not be deleted.');
}

export async function toggleCommunityVote({ recommendationId, userId, hasUpvoted }) {
  const client = requireSupabase();
  if (hasUpvoted) {
    const { error } = await client
      .from('community_votes')
      .delete()
      .eq('recommendation_id', recommendationId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await client
      .from('community_votes')
      .insert({ recommendation_id: recommendationId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  }
}

export async function reportCommunityRecommendation({ recommendationId, recommendationTitle, reporterId, reason, details }) {
  const client = requireSupabase();
  const { error } = await client.from('community_reports').insert({
    recommendation_id: recommendationId,
    recommendation_title: String(recommendationTitle || 'Deleted recommendation').slice(0, 80),
    reporter_id: reporterId,
    reason,
    details: details.trim() || null,
  });
  if (error?.code === '23505') throw new Error('You have already reported this recommendation.');
  if (error) throw error;
}

export async function getCommunityReports() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('community_reports')
    .select('id,recommendation_id,recommendation_title,reporter_id,reason,details,status,created_at,community_profiles!community_reports_reporter_id_fkey(display_name),community_recommendations!community_reports_recommendation_id_fkey(id,title,is_hidden)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function updateCommunityReportStatus(reportId, status) {
  const client = requireSupabase();
  const { error } = await client
    .from('community_reports')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) throw error;
}

export async function setCommunityRecommendationHidden(recommendationId, hidden) {
  const client = requireSupabase();
  const { error } = await client.rpc('admin_set_community_recommendation_hidden', {
    recommendation_id_input: recommendationId,
    hidden_input: hidden,
  });
  if (error) throw error;
}
