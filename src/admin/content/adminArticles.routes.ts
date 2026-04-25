import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import * as ctrl from './adminArticles.controller.js';
import { ArticleListQuerySchema, CreateArticleSchema, UpdateArticleSchema } from './adminArticles.schema.js';

export const adminArticlesRoutes: FastifyPluginAsync = async (app) => {
  const guard = [app.requireAudience(JWT_AUDIENCE.ADMIN), requirePermission(AdminPermission.ARTICLE_MANAGE)];

  app.get('/v1/admin/articles', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'List articles', querystring: zodToJsonSchema(ArticleListQuerySchema) }, handler: ctrl.listArticles });
  app.get('/v1/admin/articles/:id', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Get article' }, handler: ctrl.getArticle });
  app.post('/v1/admin/articles', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Create article', body: zodToJsonSchema(CreateArticleSchema) }, handler: ctrl.createArticle });
  app.patch('/v1/admin/articles/:id', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Update article', body: zodToJsonSchema(UpdateArticleSchema) }, handler: ctrl.updateArticle });
  app.delete('/v1/admin/articles/:id', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Delete article' }, handler: ctrl.deleteArticle });
  app.post('/v1/admin/articles/:id/publish', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Publish article' }, handler: ctrl.publishArticle });
  app.post('/v1/admin/articles/:id/unpublish', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Unpublish article' }, handler: ctrl.unpublishArticle });
};
