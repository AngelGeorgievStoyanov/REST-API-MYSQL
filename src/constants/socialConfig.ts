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
      { key: 'comment', create: false, edit: false, delete: false },
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
      { key: 'comment', create: false, edit: false, delete: false },
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
      { key: 'tripGroup', create: false, edit: false, delete: false },
      { key: 'trip', create: true, edit: true, delete: true },
      { key: 'point', create: false, edit: false, delete: false },
      { key: 'image', create: false, edit: false, delete: false },
      { key: 'comment', create: false, edit: false, delete: false },
    ],
  },
  {
    key: 'replyComment',
    isActive: false,
    targets: [
      { key: 'tripGroup', create: false, edit: false, delete: false },
      { key: 'trip', create: false, edit: false, delete: false },
      { key: 'point', create: false, edit: false, delete: false },
      { key: 'image', create: false, edit: false, delete: false },
      { key: 'comment', create: false, edit: false, delete: false },
    ],
  },
];
