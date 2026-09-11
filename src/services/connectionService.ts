import { supabase } from '../lib/supabase';
import type { ConnectionRequest, ConnectionUserType } from '../types/supabase';

export interface EnrichedConnectionRequest extends ConnectionRequest {
  sender?: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    created_at?: string;
  };
  receiver?: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    created_at?: string;
  };
  slp_info?: {
    id: string;
    professional_title: string | null;
    specialization: string | null;
    organization: string | null;
    availability_status: string | null;
  } | null;
}

export interface SLPCardData {
  id: string; // slps.id
  user_id: string; // profiles.id
  full_name: string;
  professional_title: string | null;
  specialization: string | null;
  organization: string | null;
  availability_status: string | null;
  profile_image?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  qualification?: string | null;
  years_of_experience?: string | null;
  created_at?: string;
  relationshipStatus: 'connected' | 'pending_sent' | 'pending_received' | 'available';
  pendingRequestId?: string;
}

export interface PatientCardData {
  id: string; // profiles.id
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  bio?: string | null;
  practice_goal?: string | null;
  created_at: string;
  relationshipStatus: 'connected' | 'pending_sent' | 'pending_received' | 'available';
  pendingRequestId?: string;
}

export const connectionService = {
  /**
   * Get active SLP for a given patient user ID
   */
  async getPatientActiveSLP(patientUserId: string) {
    try {
      const { data, error } = await (supabase.from('patient_assignments') as any)
        .select(`
          id,
          patient_id,
          slp_id,
          assigned_at,
          status,
          slps (
            id,
            user_id,
            full_name,
            email,
            phone,
            professional_title,
            specialization,
            organization,
            availability_status,
            license_number,
            profile_image,
            bio,
            qualification,
            years_of_experience
          )
        `)
        .eq('patient_id', patientUserId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (error) {
        console.error('Error fetching active SLP:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('getPatientActiveSLP exception:', err);
      return null;
    }
  },

  /**
   * Get active patients assigned to a given SLP user ID
   */
  async getSLPActivePatients(slpUserId: string) {
    try {
      const { data: slpData } = await (supabase.from('slps') as any)
        .select('id')
        .eq('user_id', slpUserId)
        .maybeSingle();

      if (!slpData?.id) return [];

      const { data, error } = await (supabase.from('patient_assignments') as any)
        .select(`
          id,
          patient_id,
          slp_id,
          assigned_at,
          status,
          profiles!patient_assignments_patient_id_fkey (
            id,
            full_name,
            email,
            avatar_url,
            bio,
            practice_goal,
            created_at
          )
        `)
        .eq('slp_id', slpData.id)
        .eq('status', 'ACTIVE')
        .order('assigned_at', { ascending: false });

      if (error) {
        console.error('Error fetching SLP active patients:', error);
        return [];
      }

      return (data || []).map((a: any) => ({
        assignmentId: a.id,
        patientId: a.patient_id,
        slpId: a.slp_id,
        assignedAt: a.assigned_at,
        patient: a.profiles,
      }));
    } catch (err) {
      console.error('getSLPActivePatients exception:', err);
      return [];
    }
  },

  /**
   * Fetch all SLPs for the Patient discovery directory, including relationship status
   */
  async getAvailableSLPs(patientUserId: string): Promise<{
    slps: SLPCardData[];
    hasActiveSLP: boolean;
    activeSLPId?: string;
  }> {
    try {
      // 1. Fetch SLP directory
      const { data: slpsData, error: slpError } = await (supabase.from('slps') as any)
        .select('id, user_id, full_name, professional_title, specialization, organization, availability_status, profile_image, bio, qualification, years_of_experience, created_at')
        .order('created_at', { ascending: false });

      if (slpError) throw slpError;

      // 2. Fetch active patient_assignments for this patient
      const { data: activeAssignments } = await (supabase.from('patient_assignments') as any)
        .select('slp_id, status')
        .eq('patient_id', patientUserId)
        .eq('status', 'ACTIVE');

      const activeSlpIdSet = new Set((activeAssignments || []).map((a: any) => a.slp_id));
      const hasActiveSLP = activeSlpIdSet.size > 0;
      const activeSLPId = activeAssignments?.[0]?.slp_id;

      // 3. Fetch pending connection requests involving this patient
      const { data: pendingRequests } = await (supabase.from('connection_requests') as any)
        .select('id, sender_id, receiver_id, sender_type, status')
        .or(`sender_id.eq.${patientUserId},receiver_id.eq.${patientUserId}`)
        .eq('status', 'pending');

      const formatted: SLPCardData[] = (slpsData || []).map((s: any) => {
        let relationshipStatus: SLPCardData['relationshipStatus'] = 'available';
        let pendingRequestId: string | undefined;

        if (activeSlpIdSet.has(s.id)) {
          relationshipStatus = 'connected';
        } else {
          // Check pending requests
          const sentReq = pendingRequests?.find(
            (r: any) => r.sender_id === patientUserId && r.receiver_id === s.user_id
          );
          const receivedReq = pendingRequests?.find(
            (r: any) => r.receiver_id === patientUserId && r.sender_id === s.user_id
          );

          if (sentReq) {
            relationshipStatus = 'pending_sent';
            pendingRequestId = sentReq.id;
          } else if (receivedReq) {
            relationshipStatus = 'pending_received';
            pendingRequestId = receivedReq.id;
          }
        }

        return {
          id: s.id,
          user_id: s.user_id,
          full_name: s.full_name || 'Speech-Language Pathologist',
          professional_title: s.professional_title || 'Speech-Language Pathologist',
          specialization: s.specialization || 'Voice & Fluency Disorders',
          organization: s.organization || 'SpeakEase Clinical Care',
          availability_status: s.availability_status || 'Accepting Patients',
          profile_image: s.profile_image || null,
          avatar_url: s.profile_image || null,
          bio: s.bio || null,
          qualification: s.qualification || null,
          years_of_experience: s.years_of_experience || null,
          created_at: s.created_at,
          relationshipStatus,
          pendingRequestId,
        };
      });

      return {
        slps: formatted,
        hasActiveSLP,
        activeSLPId,
      };
    } catch (err) {
      console.error('getAvailableSLPs error:', err);
      return { slps: [], hasActiveSLP: false };
    }
  },

  /**
   * Fetch all registered Patients for the SLP discovery directory
   */
  async getAvailablePatients(slpUserId: string): Promise<PatientCardData[]> {
    try {
      // 1. Get SLP row ID
      const { data: slpRow } = await (supabase.from('slps') as any)
        .select('id')
        .eq('user_id', slpUserId)
        .maybeSingle();

      const slpId = slpRow?.id;

      // 2. Fetch registered patients (only basic public info)
      const { data: patientProfiles, error: pError } = await (supabase.from('profiles') as any)
        .select('id, full_name, created_at')
        .eq('role', 'USER')
        .order('created_at', { ascending: false });

      if (pError) throw pError;

      // 3. Fetch active patient_assignments for this SLP
      let activePatientIds = new Set<string>();
      if (slpId) {
        const { data: activeAssignments } = await (supabase.from('patient_assignments') as any)
          .select('patient_id')
          .eq('slp_id', slpId)
          .eq('status', 'ACTIVE');
        activePatientIds = new Set((activeAssignments || []).map((a: any) => a.patient_id));
      }

      // 4. Fetch pending requests involving this SLP
      const { data: pendingRequests } = await (supabase.from('connection_requests') as any)
        .select('id, sender_id, receiver_id, sender_type, status')
        .or(`sender_id.eq.${slpUserId},receiver_id.eq.${slpUserId}`)
        .eq('status', 'pending');

      const formatted: PatientCardData[] = (patientProfiles || []).map((p: any) => {
        let relationshipStatus: PatientCardData['relationshipStatus'] = 'available';
        let pendingRequestId: string | undefined;

        if (activePatientIds.has(p.id)) {
          relationshipStatus = 'connected';
        } else {
          const sentReq = pendingRequests?.find(
            (r: any) => r.sender_id === slpUserId && r.receiver_id === p.id
          );
          const receivedReq = pendingRequests?.find(
            (r: any) => r.receiver_id === slpUserId && r.sender_id === p.id
          );

          if (sentReq) {
            relationshipStatus = 'pending_sent';
            pendingRequestId = sentReq.id;
          } else if (receivedReq) {
            relationshipStatus = 'pending_received';
            pendingRequestId = receivedReq.id;
          }
        }

        return {
          id: p.id,
          full_name: p.full_name || 'Anonymous Patient',
          created_at: p.created_at,
          relationshipStatus,
          pendingRequestId,
        };
      });

      return formatted;
    } catch (err) {
      console.error('getAvailablePatients error:', err);
      return [];
    }
  },

  /**
   * Fetch all connection requests for a user with profiles and SLP info
   */
  async getConnectionRequests(userId: string): Promise<{
    received: EnrichedConnectionRequest[];
    sent: EnrichedConnectionRequest[];
  }> {
    try {
      const { data, error } = await (supabase.from('connection_requests') as any)
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return { received: [], sent: [] };

      // Collect all user IDs to fetch names & roles
      const userIds = Array.from(new Set(data.flatMap((r: any) => [r.sender_id, r.receiver_id])));
      const { data: profilesData } = await (supabase.from('profiles') as any)
        .select('id, full_name, email, role, created_at')
        .in('id', userIds);

      const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

      // Collect SLP info for any SLP users
      const slpUserIds = (profilesData || [])
        .filter((p: any) => p.role === 'SLP')
        .map((p: any) => p.id);

      let slpMap = new Map();
      if (slpUserIds.length > 0) {
        const { data: slpsData } = await (supabase.from('slps') as any)
          .select('id, user_id, professional_title, specialization, organization, availability_status')
          .in('user_id', slpUserIds);
        slpMap = new Map((slpsData || []).map((s: any) => [s.user_id, s]));
      }

      const enriched: EnrichedConnectionRequest[] = data.map((r: any) => {
        const sender = profileMap.get(r.sender_id);
        const receiver = profileMap.get(r.receiver_id);
        const slpUserId = r.sender_type === 'SLP' ? r.sender_id : r.receiver_id;
        const slp_info = slpMap.get(slpUserId) || null;

        return {
          ...r,
          sender,
          receiver,
          slp_info,
        };
      });

      const received = enriched.filter((r) => r.receiver_id === userId);
      const sent = enriched.filter((r) => r.sender_id === userId);

      return { received, sent };
    } catch (err) {
      console.error('getConnectionRequests error:', err);
      return { received: [], sent: [] };
    }
  },

  /**
   * Send a connection request
   */
  async sendRequest(params: {
    senderId: string;
    receiverId: string;
    senderType: ConnectionUserType;
    receiverType: ConnectionUserType;
  }) {
    const { data, error } = await (supabase.from('connection_requests') as any)
      .insert({
        sender_id: params.senderId,
        receiver_id: params.receiverId,
        sender_type: params.senderType,
        receiver_type: params.receiverType,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Accept a connection request
   */
  async acceptRequest(requestId: string) {
    const { data, error } = await (supabase.from('connection_requests') as any)
      .update({
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Reject a connection request
   */
  async rejectRequest(requestId: string) {
    const { data, error } = await (supabase.from('connection_requests') as any)
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Cancel a connection request
   */
  async cancelRequest(requestId: string) {
    const { data, error } = await (supabase.from('connection_requests') as any)
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Safely end / disconnect an active clinical relationship
   */
  async disconnectConnection(patientId: string, slpId: string) {
    const { data, error } = await (supabase.rpc as any)('disconnect_patient_slp', {
      p_patient_id: patientId,
      p_slp_id: slpId,
    });

    if (error) throw error;
    return data;
  },
};
