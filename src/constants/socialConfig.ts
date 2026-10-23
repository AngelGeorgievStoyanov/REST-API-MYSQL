import { type SocialConfig } from '../model/config';

export const SOCIAL_CONFIG: SocialConfig[] = [
  {
    key: 'like',
    isActive: true,
    targets: [
      { key: 'tripGroup', create: true, edit: false, delete: true },
      { key: 'trip', create: false, edit: false, delete: false },
      { key: 'point', create: false, edit: false, delete: false },
      { key: 'image', create: false, edit: false, delete: false },
      { key: 'comment', create: true, edit: false, delete: true },
    ],
  },
  {
    key: 'favorite',
    isActive: true,
    targets: [
      { key: 'tripGroup', create: true, edit: false, delete: true },
      { key: 'trip', create: false, edit: false, delete: false },
      { key: 'point', create: false, edit: false, delete: false },
      { key: 'image', create: false, edit: false, delete: false },
      { key: 'comment', create: true, edit: false, delete: true },
    ],
  },
  {
    key: 'report',
    isActive: true,
    targets: [
      { key: 'tripGroup', create: true, edit: false, delete: true },
      { key: 'trip', create: false, edit: false, delete: false },
      { key: 'point', create: false, edit: false, delete: false },
      { key: 'image', create: false, edit: false, delete: false },
      { key: 'comment', create: true, edit: false, delete: true },
    ],
  },
  {
    key: 'comment',
    isActive: true,
    targets: [
      { key: 'tripGroup', create: true, edit: false, delete: false },
      { key: 'trip', create: true, edit: false, delete: false },
      { key: 'point', create: true, edit: false, delete: false },
      { key: 'image', create: true, edit: false, delete: false },
      { key: 'comment', create: false, edit: true, delete: true },
    ],
  },
  {
    key: 'replyComment',
    isActive: true,
    targets: [
      { key: 'tripGroup', create: false, edit: false, delete: false },
      { key: 'trip', create: false, edit: false, delete: false },
      { key: 'point', create: false, edit: false, delete: false },
      { key: 'image', create: false, edit: false, delete: false },
      { key: 'comment', create: true, edit: true, delete: true },
    ],
  },
];
