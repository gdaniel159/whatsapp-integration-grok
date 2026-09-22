import { LeadStatus } from '@prisma/client';
import {
  contactCreatedActivity,
  diffCommercialActivities,
  leadStatusLabelEs,
  notesEqual,
  tagsDiff,
  tagsEqual,
} from './commercial-activity.util';

describe('commercial-activity.util', () => {
  describe('leadStatusLabelEs', () => {
    it('returns Spanish labels', () => {
      expect(leadStatusLabelEs(LeadStatus.NEW)).toBe('Nuevo');
      expect(leadStatusLabelEs(LeadStatus.IN_PROGRESS)).toBe('En seguimiento');
      expect(leadStatusLabelEs(LeadStatus.QUOTED)).toBe('Cotizado');
    });
  });

  describe('notesEqual', () => {
    it('treats null, undefined and empty string as equal', () => {
      expect(notesEqual(null, '')).toBe(true);
      expect(notesEqual(undefined, null)).toBe(true);
      expect(notesEqual('', undefined)).toBe(true);
      expect(notesEqual('a', 'a')).toBe(true);
      expect(notesEqual('a', 'b')).toBe(false);
      expect(notesEqual(null, 'x')).toBe(false);
    });
  });

  describe('tagsEqual / tagsDiff', () => {
    it('ignores order for equality', () => {
      expect(tagsEqual(['Toyota', 'Hilux'], ['Hilux', 'Toyota'])).toBe(true);
      expect(tagsEqual(['Toyota'], ['Toyota', 'Hilux'])).toBe(false);
    });

    it('computes added/removed', () => {
      expect(tagsDiff(['Toyota'], ['Toyota', 'Hilux'])).toEqual({
        added: ['Hilux'],
        removed: [],
      });
      expect(tagsDiff(['Toyota', 'Hilux'], ['Hilux'])).toEqual({
        added: [],
        removed: ['Toyota'],
      });
    });
  });

  describe('diffCommercialActivities', () => {
    const base = {
      leadStatus: LeadStatus.NEW,
      notes: null as string | null,
      tags: [] as string[],
    };

    it('STATUS_CHANGED when leadStatus changes', () => {
      const acts = diffCommercialActivities(base, {
        leadStatus: LeadStatus.INTERESTED,
      });
      expect(acts).toHaveLength(1);
      expect(acts[0].type).toBe('STATUS_CHANGED');
      expect(acts[0].source).toBe('USER');
      expect(acts[0].title).toBe('Estado cambiado a Interesado');
      expect(acts[0].metadata).toEqual({ from: 'NEW', to: 'INTERESTED' });
    });

    it('no activity when leadStatus unchanged', () => {
      expect(
        diffCommercialActivities(base, { leadStatus: LeadStatus.NEW }),
      ).toHaveLength(0);
    });

    it('NOTES_UPDATED without storing note bodies', () => {
      const acts = diffCommercialActivities(base, { notes: 'Hola' });
      expect(acts).toHaveLength(1);
      expect(acts[0].type).toBe('NOTES_UPDATED');
      expect(acts[0].title).toBe('Notas actualizadas');
      expect(acts[0].description).toBeUndefined();
      expect(acts[0].metadata).toBeUndefined();
    });

    it('no NOTES_UPDATED when empty equivalents', () => {
      expect(diffCommercialActivities(base, { notes: '' })).toHaveLength(0);
      expect(
        diffCommercialActivities({ ...base, notes: '' }, { notes: null as never }),
      ).toHaveLength(0);
    });

    it('TAGS_UPDATED with added/removed metadata', () => {
      const acts = diffCommercialActivities(
        { ...base, tags: ['Toyota'] },
        { tags: ['Toyota', 'Hilux'] },
      );
      expect(acts).toHaveLength(1);
      expect(acts[0].type).toBe('TAGS_UPDATED');
      expect(acts[0].title).toBe('Etiquetas actualizadas');
      expect(acts[0].metadata).toEqual({ added: ['Hilux'], removed: [] });
    });

    it('no TAGS_UPDATED for order-only change', () => {
      expect(
        diffCommercialActivities(
          { ...base, tags: ['Toyota', 'Hilux'] },
          { tags: ['Hilux', 'Toyota'] },
        ),
      ).toHaveLength(0);
    });

    it('omitted fields produce no activities', () => {
      expect(diffCommercialActivities(base, {})).toHaveLength(0);
    });

    it('multi-field PATCH can yield three activities', () => {
      const acts = diffCommercialActivities(
        { leadStatus: LeadStatus.NEW, notes: 'A', tags: ['Toyota'] },
        {
          leadStatus: LeadStatus.QUOTED,
          notes: 'B',
          tags: ['Hilux'],
        },
      );
      expect(acts).toHaveLength(3);
      expect(acts.map((a) => a.type)).toEqual([
        'STATUS_CHANGED',
        'NOTES_UPDATED',
        'TAGS_UPDATED',
      ]);
    });
  });

  describe('contactCreatedActivity', () => {
    it('SYSTEM title Contacto creado', () => {
      const a = contactCreatedActivity();
      expect(a.type).toBe('CONTACT_CREATED');
      expect(a.source).toBe('SYSTEM');
      expect(a.title).toBe('Contacto creado');
    });
  });
});
