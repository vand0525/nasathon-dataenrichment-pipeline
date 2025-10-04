# Pipeline

This project is a simple pipeline for processing bioscience articles.

## Overview

### Parse
Takes a CSV of article links, downloads the XML, and parses it into JSON.  
Output is stored in `data/parsed`.

### Enrich
Sends parsed JSON to an LLM to generate additional properties (such as summaries and tags).  
Also generates vector embeddings for each article.  
Output is stored in `data/enriched`.

### Upload
Pushes the enriched JSON into a MongoDB collection.  
Input is taken from `data/enriched`.
