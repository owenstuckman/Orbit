/**
 * Email Service
 *
 * Sends transactional emails via the send-email edge function.
 * All methods are fire-and-forget — failures are logged but never block the caller.
 *
 * See docs/SMTP_SETUP.md for configuration.
 */

import { functions } from './supabase';

/** Send a raw email via the edge function. Returns true if sent, false otherwise. */
async function send(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const { error } = await functions.invoke('send-email', {
      body: { to, subject, html }
    });
    if (error) {
      console.warn('Email send failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Email service error:', err);
    return false;
  }
}

// ============================================================================
// Transactional Email Templates
// ============================================================================

export const emailService = {
  /**
   * Send organization invitation email.
   * @param email - Invitee email
   * @param inviteCode - 6-char alphanumeric code
   * @param orgName - Organization name
   * @param inviterName - Name of the person who sent the invite
   */
  async sendInvitation(
    email: string,
    inviteCode: string,
    orgName: string,
    inviterName: string
  ): Promise<boolean> {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return send(
      email,
      `You've been invited to join ${orgName} on Orbit`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You're invited to ${orgName}</h2>
          <p>${inviterName} has invited you to join their organization on Orbit.</p>
          <p>Use this invite code to get started:</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; letter-spacing: 4px; font-weight: bold; background: #f3f4f6; padding: 12px 24px; border-radius: 8px;">${inviteCode}</span>
          </div>
          <p style="text-align: center;">
            <a href="${appUrl}/auth/register?invite=${inviteCode}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              Accept Invitation
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">This invitation expires in 7 days.</p>
        </div>
      `
    );
  },

  /**
   * Notify external contractor of a new task assignment.
   * @param email - Contractor email
   * @param contractorName - Contractor's name
   * @param taskTitle - Task title
   * @param submissionToken - Token for the submission URL
   */
  async sendExternalAssignment(
    email: string,
    contractorName: string,
    taskTitle: string,
    submissionToken: string
  ): Promise<boolean> {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return send(
      email,
      `New task assignment: ${taskTitle}`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Task Assignment</h2>
          <p>Hi ${contractorName},</p>
          <p>You've been assigned a new task: <strong>${taskTitle}</strong></p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${appUrl}/submit/${submissionToken}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              View & Submit Work
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">If you also received a contract, please review and sign it before starting work.</p>
        </div>
      `
    );
  },

  /**
   * Notify task assignee of QC review result.
   * @param email - Assignee email
   * @param taskTitle - Task title
   * @param passed - Whether the review passed
   * @param feedback - Reviewer feedback (optional)
   */
  async sendQCResult(
    email: string,
    taskTitle: string,
    passed: boolean,
    feedback?: string
  ): Promise<boolean> {
    const statusColor = passed ? '#16a34a' : '#dc2626';
    const statusText = passed ? 'Approved' : 'Needs Revision';
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return send(
      email,
      `Task ${passed ? 'approved' : 'rejected'}: ${taskTitle}`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>QC Review Complete</h2>
          <p>Your submission for <strong>${taskTitle}</strong> has been reviewed.</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 20px; font-weight: bold; color: ${statusColor};">${statusText}</span>
          </div>
          ${feedback ? `<div style="background: #f9fafb; border-left: 4px solid #d1d5db; padding: 12px 16px; margin: 16px 0;"><strong>Feedback:</strong><br/>${feedback}</div>` : ''}
          <p style="text-align: center; margin: 24px 0;">
            <a href="${appUrl}/tasks" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              View Tasks
            </a>
          </p>
        </div>
      `
    );
  },

  /**
   * Notify user that a payout is ready.
   * @param email - User email
   * @param netAmount - Net payout amount
   * @param payoutType - Type of payout (e.g. 'task', 'qc', 'pm_profit_share')
   * @param taskTitle - Related task title (optional)
   */
  async sendPayoutReady(
    email: string,
    netAmount: number,
    payoutType: string,
    taskTitle?: string
  ): Promise<boolean> {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return send(
      email,
      `Payout ready: $${netAmount.toFixed(2)}`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your Payout is Ready</h2>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; color: #16a34a;">$${netAmount.toFixed(2)}</span>
          </div>
          <p style="text-align: center; color: #6b7280;">Type: ${payoutType}${taskTitle ? ` &middot; Task: ${taskTitle}` : ''}</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${appUrl}/payouts" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              View Payout Details
            </a>
          </p>
        </div>
      `
    );
  },

  /**
   * Notify contractor about a contract ready for signing.
   * @param email - Contractor email
   * @param contractorName - Contractor name
   * @param signingToken - Contract signing token
   */
  async sendContractReady(
    email: string,
    contractorName: string,
    signingToken: string
  ): Promise<boolean> {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return send(
      email,
      'Contract ready for your signature',
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Contract Ready for Signing</h2>
          <p>Hi ${contractorName},</p>
          <p>A contract has been prepared for your review and signature.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${appUrl}/contract/${signingToken}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              Review & Sign Contract
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">Please review the terms carefully before signing.</p>
        </div>
      `
    );
  }
};
