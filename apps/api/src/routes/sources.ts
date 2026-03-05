import { NextApiRequest, NextApiResponse } from 'next';
import { getSources, createSource, updateSource, deleteSource } from '../../lib/sourceService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    switch (req.method) {
        case 'GET':
            try {
                const sources = await getSources();
                res.status(200).json(sources);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch sources' });
            }
            break;
        case 'POST':
            try {
                const newSource = await createSource(req.body);
                res.status(201).json(newSource);
            } catch (error) {
                res.status(400).json({ error: 'Failed to create source' });
            }
            break;
        case 'PUT':
            try {
                const updatedSource = await updateSource(req.body);
                res.status(200).json(updatedSource);
            } catch (error) {
                res.status(400).json({ error: 'Failed to update source' });
            }
            break;
        case 'DELETE':
            try {
                await deleteSource(req.body.id);
                res.status(204).end();
            } catch (error) {
                res.status(400).json({ error: 'Failed to delete source' });
            }
            break;
        default:
            res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
            res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}