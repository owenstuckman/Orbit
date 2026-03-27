/**
 * Slack Webhook Integration Service
 *
 * Sends notifications to Slack channels via incoming webhooks.
 * Configure webhook URL in organization settings.
 *
 * Usage:
 *   import { slackWebhook } from '$lib/services/webhooks';
 *   slackWebhook.notifyTaskCompleted(task, user);
 */

import { get } from 'svelte/store';
import { organization } from '$lib/stores/auth';

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: { type: string; text: string }[];
  elements?: { type: string; text: string }[];
  accessory?: Record<string, unknown>;
}

function getWebhookUrl(): string | null {
  const org = get(organization);
  return (org?.settings as Record<string, unknown>)?.slack_webhook_url as string | null;
}

async function sendToSlack(message: SlackMessage): Promise<boolean> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return false;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    return response.ok;
  } catch (err) {
    console.error('Slack webhook error:', err);
    return false;
  }
}

function header(text: string): SlackBlock {
  return { type: 'header', text: { type: 'plain_text', text, emoji: true } };
}

function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

function fields(...pairs: [string, string][]): SlackBlock {
  return {
    type: 'section',
    fields: pairs.map(([label, value]) => ({
      type: 'mrkdwn',
      text: `*${label}*\n${value}`,
    })),
  };
}

function divider(): SlackBlock {
  return { type: 'divider' };
}

export const slackWebhook = {
  /** Check if Slack integration is configured */
  isConfigured(): boolean {
    return !!getWebhookUrl();
  },

  /** Notify when a new task is created */
  async notifyTaskCreated(task: { title: string; dollar_value: number; urgency_multiplier: number; required_level: number }, creatorName: string): Promise<boolean> {
    return sendToSlack({
      text: `New task created: ${task.title}`,
      blocks: [
        header('📋 New Task Created'),
        section(`*${task.title}*`),
        fields(
          ['Value', `$${task.dollar_value.toFixed(2)}`],
          ['Urgency', `${task.urgency_multiplier}x`],
          ['Required Level', `${task.required_level}+`],
          ['Created By', creatorName],
        ),
      ],
    });
  },

  /** Notify when a task is completed and submitted */
  async notifyTaskSubmitted(taskTitle: string, submitterName: string): Promise<boolean> {
    return sendToSlack({
      text: `Task submitted for review: ${taskTitle}`,
      blocks: [
        header('✅ Task Submitted'),
        section(`*${taskTitle}* submitted by ${submitterName} and is now awaiting QC review.`),
      ],
    });
  },

  /** Notify when a QC review approves a task */
  async notifyTaskApproved(taskTitle: string, reviewerName: string, confidence: number): Promise<boolean> {
    return sendToSlack({
      text: `Task approved: ${taskTitle}`,
      blocks: [
        header('🎉 Task Approved'),
        section(`*${taskTitle}* has been approved by ${reviewerName}.`),
        fields(
          ['AI Confidence', `${(confidence * 100).toFixed(0)}%`],
          ['Status', 'Approved ✅'],
        ),
      ],
    });
  },

  /** Notify when a task is rejected */
  async notifyTaskRejected(taskTitle: string, reviewerName: string, feedback: string): Promise<boolean> {
    return sendToSlack({
      text: `Task rejected: ${taskTitle}`,
      blocks: [
        header('❌ Task Rejected'),
        section(`*${taskTitle}* was rejected by ${reviewerName}.`),
        section(`> ${feedback.slice(0, 200)}${feedback.length > 200 ? '...' : ''}`),
      ],
    });
  },

  /** Notify when a new project is created */
  async notifyProjectCreated(projectName: string, budget: number, creatorName: string): Promise<boolean> {
    return sendToSlack({
      text: `New project: ${projectName}`,
      blocks: [
        header('📁 New Project'),
        section(`*${projectName}* created by ${creatorName}`),
        fields(
          ['Budget', `$${budget.toFixed(2)}`],
          ['Status', 'Draft'],
        ),
      ],
    });
  },

  /** Notify when a user levels up */
  async notifyLevelUp(userName: string, newLevel: number): Promise<boolean> {
    return sendToSlack({
      text: `${userName} reached Level ${newLevel}!`,
      blocks: [
        header('⬆️ Level Up!'),
        section(`🎮 *${userName}* has reached *Level ${newLevel}*! 🎉`),
      ],
    });
  },

  /** Notify when a new member joins */
  async notifyMemberJoined(memberName: string, role: string): Promise<boolean> {
    return sendToSlack({
      text: `${memberName} joined as ${role}`,
      blocks: [
        header('👋 New Team Member'),
        section(`*${memberName}* joined the team as *${role}*.`),
      ],
    });
  },

  /** Send a custom message */
  async sendCustom(message: SlackMessage): Promise<boolean> {
    return sendToSlack(message);
  },
};
